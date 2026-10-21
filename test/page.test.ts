import assert from "node:assert/strict";
import { parseTSV, summarize } from "../src/format.ts";
import { renderTablePage } from "../src/page.ts";

// parseTSV: real tables only.
assert.equal(parseTSV("just text\nmore text"), null);
assert.equal(parseTSV("a\tb"), null); // header only
const p = parseTSV("Site\tStatus\nSITE103\tIP\nSITE106\t\n");
assert.deepEqual(p?.headers, ["Site", "Status"]);
assert.deepEqual(p?.rows, [["SITE103", "IP"], ["SITE106", ""]]);

assert.equal(summarize({ title: "", headers: ["A", "B"], rows: [] }), "A · B");
assert.ok(summarize({ title: "", headers: Array(200).fill("Header"), rows: [] }).endsWith("…"));

// Page: cell text cannot break out of HTML or the data script.
const evil = '</script><img src=x onerror=alert(1)>';
const html = renderTablePage({
  tables: [{ title: "T <b>", headers: ["Position", "Note"], rows: [["51.1.1", evil], ["R8881 S9000(B8B)", ""]] }],
  notes: "row 2: unsure",
});
assert.equal(html.match(/<\/script>/g)?.length, 1, "only the page's own closing script tag");
assert.ok(!html.includes("<img src=x"), "cell html is escaped");
assert.ok(html.includes("T &lt;b&gt;"));
assert.ok(html.includes("51.1.1") && html.includes("R8881 S9000(B8B)"));
assert.ok(html.includes("mso-number-format"), "clipboard html keeps cells as text in Excel");
assert.ok(html.includes("2 rows × 2 columns"));
assert.ok(html.includes("row 2: unsure"));

// The embedded data is valid JSON with the exact TSV.
const json = html.match(/const DATA = (.*);\n/)![1];
const data = JSON.parse(json);
assert.equal(data[0].tsv, `Position\tNote\n51.1.1\t${evil}\nR8881 S9000(B8B)\t`);
assert.equal(data[0].tsvNoHeader, `51.1.1\t${evil}\nR8881 S9000(B8B)\t`);

console.log("page tests passed");
