/**
 * Accuracy check: run every samples/<name>.png that has a samples/<name>.expected.tsv
 * through one or more Workers AI vision models, using the bot's own prompt and schema,
 * and count wrong cells.
 *
 *   node --experimental-strip-types scripts/eval.ts [model ...]
 *
 * Auth: CLOUDFLARE_API_TOKEN, or the token from `wrangler login`. Account: CLOUDFLARE_ACCOUNT_ID
 * or the first account the token can see. Uses the free Workers AI allocation (a few hundred
 * neurons per image per model).
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { modelText, normalizeTable, parseJsonObject, parseTSV } from "../src/format.ts";
import { EXTRACTION_PROMPT, EXTRACTION_SCHEMA, type Table } from "../src/types.ts";

const DEFAULT_MODELS = [
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/qwen/qwen3.8-27b",
  "@cf/deepseek-ai/deepseek-v4.1-flash-1017",
  "@cf/zai-org/glm-5.3-flash",
  "@cf/meta/llama-3.2-11b-vision-instruct",
];

function token(): string {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const cfg = join(homedir(), "Library/Preferences/.wrangler/config/default.toml");
  const alt = join(homedir(), ".config/.wrangler/config/default.toml");
  const text = readFileSync(existsSync(cfg) ? cfg : alt, "utf8");
  return text.match(/oauth_token\s*=\s*"([^"]+)"/)![1];
}

async function account(tok: string): Promise<string> {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID;
  const r = (await (await fetch("https://api.cloudflare.com/client/v4/accounts", { headers: { authorization: `Bearer ${tok}` } })).json()) as any;
  return r.result[0].id;
}

async function run(tok: string, acc: string, model: string, png: Buffer): Promise<{ table?: Table; ms: number; error?: string }> {
  const started = Date.now();
  const body = {
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Extract the table(s) from this image." },
          { type: "image_url", image_url: { url: `data:image/png;base64,${png.toString("base64")}` } },
        ],
      },
    ],
    response_format: { type: "json_schema", json_schema: EXTRACTION_SCHEMA },
    max_tokens: 8192,
    temperature: 0,
  };
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acc}/ai/run/${model}`, {
      method: "POST",
      headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    const json = (await res.json()) as any;
    if (!json.success) return { ms: Date.now() - started, error: JSON.stringify(json.errors).slice(0, 200) };
    const obj = parseJsonObject(modelText(json.result)) as { tables?: Partial<Table>[] };
    const first = obj.tables?.[0];
    return { ms: Date.now() - started, table: first ? normalizeTable(first) : undefined, error: first ? undefined : "no table" };
  } catch (e) {
    return { ms: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
  }
}

function score(expected: Table, got: Table) {
  const wrong: string[] = [];
  const all = [expected.headers, ...expected.rows];
  const gotAll = [got.headers, ...got.rows];
  let cells = 0;
  all.forEach((row, r) =>
    row.forEach((cell, c) => {
      cells++;
      const g = gotAll[r]?.[c] ?? "∅";
      if (g !== cell) wrong.push(`r${r} ${expected.headers[c]}: "${cell}" → "${g}"`);
    }),
  );
  const extraRows = Math.max(0, got.rows.length - expected.rows.length);
  const extraCols = Math.max(0, got.headers.length - expected.headers.length);
  return { cells, wrong, extraRows, extraCols };
}

const dir = "samples";
const samples = readdirSync(dir)
  .filter((f) => f.endsWith(".png") && existsSync(join(dir, f.replace(/\.png$/, ".expected.tsv"))))
  .map((f) => ({ name: f.replace(/\.png$/, ""), png: readFileSync(join(dir, f)), expected: parseTSV(readFileSync(join(dir, f.replace(/\.png$/, ".expected.tsv")), "utf8"))! }));
const models = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_MODELS;
const tok = token();
const acc = await account(tok);

const lines: string[] = ["| Model | Sample | Wrong cells | Extra rows/cols | Seconds | Error |", "|---|---|---|---|---|---|"];
const details: string[] = [];
for (const model of models) {
  const results = await Promise.all(samples.map((s) => run(tok, acc, model, s.png).then((r) => ({ s, r }))));
  for (const { s, r } of results) {
    const short = model.split("/").pop();
    if (!r.table) {
      lines.push(`| ${short} | ${s.name} | – | – | ${(r.ms / 1000).toFixed(0)} | ${r.error} |`);
      continue;
    }
    const sc = score(s.expected, r.table);
    lines.push(`| ${short} | ${s.name} | ${sc.wrong.length}/${sc.cells} | ${sc.extraRows}/${sc.extraCols} | ${(r.ms / 1000).toFixed(0)} | |`);
    if (sc.wrong.length) details.push(`${short} / ${s.name}:\n  ${sc.wrong.slice(0, 12).join("\n  ")}`);
  }
  console.error(`done ${model}`);
}
const report = `${lines.join("\n")}\n\n${details.join("\n\n")}\n`;
mkdirSync("samples/results", { recursive: true });
writeFileSync(`samples/results/eval-${new Date().toISOString().replace(/[:.]/g, "-")}.md`, report);
console.log(report);
