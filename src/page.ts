import { escapeHtml, toCSV, toTSV } from "./format.ts";
import type { Extraction, Table } from "./types.ts";

/**
 * Table viewer opened from the bot's "Open & copy" button (Telegram Mini App or browser).
 * Copy puts both HTML and TSV on the clipboard, so Excel, Google Sheets and Numbers
 * paste real cells. Cells are marked as text for Excel so codes like 51.1.1 stay as typed.
 */
export function renderTablePage(e: Extraction): string {
  const data = e.tables.map((t) => ({
    tsv: toTSV(t),
    tsvNoHeader: toTSV({ ...t, headers: [] }).replace(/^\n/, ""),
    html: clipboardHtml(t, true),
    htmlNoHeader: clipboardHtml(t, false),
    csv: toCSV(t),
    rows: t.rows.length,
  }));
  const sections = e.tables.map((t, i) => section(t, i, e.tables.length)).join("");
  const notes = e.notes ? `<p class="notes">ℹ️ ${escapeHtml(e.notes)}</p>` : "";
  // JSON inside <script>: escape "<" so cell text can never close the tag.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Table</title>
<style>
:root{--bg:#ffffff;--fg:#14171a;--muted:#5f6b76;--line:#d9dee3;--head:#f1f4f7;--accent:#2481cc;--accent-fg:#fff;--zebra:#fafbfc}
@media (prefers-color-scheme:dark){:root{--bg:#17212b;--fg:#e9eef2;--muted:#8a9aa9;--line:#2b3a48;--head:#1f2c38;--accent:#5ea9e6;--accent-fg:#0d1720;--zebra:#1a2531}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{padding:12px 16px 32px;max-width:100%}
h2{font-size:16px;margin:16px 0 4px}
.meta{color:var(--muted);font-size:13px;margin:0 0 10px}
.bar{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px}
button{border:0;border-radius:10px;padding:10px 14px;font:600 14px/1 inherit;cursor:pointer;background:var(--head);color:var(--fg)}
button.primary{background:var(--accent);color:var(--accent-fg)}
.wrap{overflow:auto;border:1px solid var(--line);border-radius:10px;max-height:70vh}
table{border-collapse:collapse;font-size:13px;white-space:nowrap}
th,td{border-bottom:1px solid var(--line);border-right:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}
th{position:sticky;top:0;background:var(--head);font-weight:600;z-index:1}
tr:nth-child(even) td{background:var(--zebra)}
td:empty::after{content:"";display:inline-block}
.notes{color:var(--muted);font-size:13px}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--fg);color:var(--bg);padding:10px 16px;border-radius:999px;font-size:14px;opacity:0;transition:opacity .2s;pointer-events:none}
.toast.show{opacity:1}
</style>
</head>
<body>
<main>
${sections}
${notes}
</main>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>
const DATA = ${json};
const toast = (m) => { const t = document.getElementById("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 1800); };
async function copy(i, withHeader) {
  const d = DATA[i];
  const text = withHeader ? d.tsv : d.tsvNoHeader;
  const html = withHeader ? d.html : d.htmlNoHeader;
  try {
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      })]);
    } else {
      await navigator.clipboard.writeText(text);
    }
  } catch (err) {
    // Fallback for webviews without the async clipboard API.
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy"); ta.remove();
    if (!ok) { toast("Copy blocked here. Long-press the table to select it."); return; }
  }
  toast("Copied " + d.rows + " rows. Paste into cell A1.");
}
function download(i) {
  const blob = new Blob([DATA[i].csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "table-" + (i + 1) + ".csv"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
</script>
</body>
</html>`;
}

function section(t: Table, i: number, total: number): string {
  const title = t.title || (total > 1 ? `Table ${i + 1}` : "");
  const head = t.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = t.rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
  return `<section>
${title ? `<h2>${escapeHtml(title)}</h2>` : ""}
<p class="meta">${t.rows.length} rows × ${t.headers.length} columns</p>
<div class="bar">
  <button class="primary" onclick="copy(${i}, true)">📋 Copy table</button>
  <button onclick="copy(${i}, false)">Copy rows only</button>
  <button onclick="download(${i})">⬇︎ CSV</button>
</div>
<div class="wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
</section>`;
}

/** HTML table for the clipboard. mso-number-format "\\@" makes Excel keep every cell as text. */
function clipboardHtml(t: Table, withHeader: boolean): string {
  const td = (v: string, tag = "td") => `<${tag} style="mso-number-format:'\\@'">${escapeHtml(v)}</${tag}>`;
  const rows = [
    ...(withHeader ? [`<tr>${t.headers.map((h) => td(h, "th")).join("")}</tr>`] : []),
    ...t.rows.map((r) => `<tr>${r.map((c) => td(c)).join("")}</tr>`),
  ];
  return `<meta charset="utf-8"><table>${rows.join("")}</table>`;
}
