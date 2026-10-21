import assert from "node:assert/strict";
import { base64, chunkLines, escapeHtml, normalizeTable, parseJsonObject, toCSV, toTSV } from "../src/format.ts";

// Ragged rows are padded, never shifted; empty cells stay empty.
const t = normalizeTable({
  title: "Sites",
  headers: ["EPMS ID", "Team", "Remarks", "RRU QTY"],
  rows: [["SITE166.Merger", "Team Lime", "", "2*R8852E S9000+"], ["SITE105.Merger", "Team Gold"]],
});
assert.deepEqual(t.rows[0], ["SITE166.Merger", "Team Lime", "", "2*R8852E S9000+"]);
assert.deepEqual(t.rows[1], ["SITE105.Merger", "Team Gold", "", ""]);

// Extra cells get generated headers.
assert.deepEqual(normalizeTable({ headers: ["A"], rows: [["1", "2"]] }).headers, ["A", "Column 2"]);

// TSV: one line per row, tabs between cells, stray tabs/newlines flattened.
assert.equal(toTSV({ title: "", headers: ["a", "b"], rows: [["x\ty", "line1\nline2"]] }), "a\tb\nx y\tline1 line2");

// CSV: BOM, quoting, CRLF.
assert.equal(toCSV({ title: "", headers: ["a", "b"], rows: [['1,2', 'say "hi"']] }), '﻿a,b\r\n"1,2","say ""hi"""');

assert.equal(escapeHtml("R8881 S9000(B8B) <x> & y"), "R8881 S9000(B8B) &lt;x&gt; &amp; y");

// Chunks split on row boundaries and fit the limit.
const big = Array.from({ length: 500 }, (_, i) => `ABCD${i}\tVND\tR8881 S9000(B8B)(51.1.1)`).join("\n");
const chunks = chunkLines(big);
assert.ok(chunks.length > 1);
assert.ok(chunks.every((c) => escapeHtml(c).length <= 3800));
assert.equal(chunks.join("\n"), big);

// JSON parsing tolerates fences / chatter / already-parsed objects.
assert.deepEqual(parseJsonObject('```json\n{"tables":[],"notes":""}\n```'), { tables: [], notes: "" });
assert.deepEqual(parseJsonObject({ a: 1 }), { a: 1 });
assert.throws(() => parseJsonObject("no json here"));

// base64 matches Node's encoder, including large buffers.
const bytes = new Uint8Array(200_000).map((_, i) => i % 256);
assert.equal(base64(bytes.buffer), Buffer.from(bytes).toString("base64"));

console.log("format tests passed");
