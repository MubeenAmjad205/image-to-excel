import type { Table } from "./types.ts";

/** Normalise model output so every row has exactly headers.length string cells. */
export function normalizeTable(t: Partial<Table>): Table {
  const headers = (t.headers ?? []).map(cell);
  const width = Math.max(headers.length, ...(t.rows ?? []).map((r) => r?.length ?? 0));
  while (headers.length < width) headers.push(`Column ${headers.length + 1}`);
  const rows = (t.rows ?? []).map((r) => {
    const out = (r ?? []).map(cell);
    while (out.length < width) out.push("");
    return out;
  });
  return { title: cell(t.title), headers, rows };
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** Tab-separated values. Pastes into Excel / Google Sheets as separate cells. */
export function toTSV(t: Table): string {
  const clean = (v: string) => v.replace(/[\t\r\n]+/g, " ");
  return [t.headers, ...t.rows].map((r) => r.map(clean).join("\t")).join("\n");
}

/** RFC 4180 CSV with a UTF-8 BOM so Excel opens non-ASCII text correctly. */
export function toCSV(t: Table): string {
  const q = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿" + [t.headers, ...t.rows].map((r) => r.map(q).join(",")).join("\r\n");
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Split a TSV into chunks that fit one Telegram message (4096 chars incl. markup).
 * Splits only on row boundaries; the header row stays in the first chunk only,
 * so pasting the chunks one under another rebuilds the table.
 */
export function chunkLines(text: string, limit = 3800): string[] {
  const chunks: string[] = [];
  let cur = "";
  for (const line of text.split("\n")) {
    const next = cur ? `${cur}\n${line}` : line;
    if (escapeHtml(next).length > limit && cur) {
      chunks.push(cur);
      cur = line;
    } else {
      cur = next;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** Workers AI returns either { response } or an OpenAI-style { choices } body, depending on model and API. */
export function modelText(result: unknown): unknown {
  const r = result as { response?: unknown; choices?: { message?: { content?: unknown } }[] } | undefined;
  if (r?.response !== undefined) return r.response;
  return r?.choices?.[0]?.message?.content;
}

/** Pull the first JSON object out of model text (handles ```json fences and chatter). */
export function parseJsonObject(raw: unknown): unknown {
  if (raw && typeof raw === "object") return raw;
  const s = String(raw ?? "");
  try {
    return JSON.parse(s);
  } catch {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(s.slice(start, end + 1));
    throw new Error("Model did not return JSON");
  }
}

/** Base64-encode binary data without Node APIs (chunked to avoid call-stack limits). */
export function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Parse a tab-separated block (e.g. a table the chat model wrote in a code block).
 * Returns null unless it has a header plus at least one row and 2+ columns.
 */
export function parseTSV(block: string): Table | null {
  const lines = block.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2 || !lines[0].includes("\t")) return null;
  const [headers, ...rows] = lines.map((l) => l.split("\t"));
  if (headers.length < 2) return null;
  return normalizeTable({ title: "", headers, rows });
}

/** One-line description of a table for the chat summary. */
export function summarize(t: Table, maxChars = 300): string {
  const cols = t.headers.join(" · ");
  return cols.length > maxChars ? cols.slice(0, maxChars - 1) + "…" : cols;
}
