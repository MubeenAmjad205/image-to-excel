import { chat, extractWithClaude, extractWithWorkersAI, type Engine } from "./extract.ts";
import { chunkLines, escapeHtml, toCSV, toTSV } from "./format.ts";
import { Store } from "./store.ts";
import { COPY_BUTTON_LIMIT, Telegram, type InlineButton } from "./telegram.ts";
import type { Env, Extraction } from "./types.ts";

const HELP = `<b>Send me a photo of a table.</b> I reply with the table ready to paste into Excel or Google Sheets.

<b>How to copy</b>
Tap the grey block (or its copy icon), then paste into cell A1. Columns split automatically.
Short tables also get a 📋 Copy button.

<b>Tips</b>
• Send the image as a <i>File</i> instead of a Photo for sharper text on big tables.
• Add a caption to steer it, e.g. <code>split RRU QTY by +</code> or <code>only rows with Installation Done</code>.
• Ask questions in plain text: <code>how many sites are IP?</code>

<b>Commands</b>
/csv – last table as a .csv file
/tsv – last table as a .tsv file
/hq – re-read the last image with the high-quality model
/clear – forget history`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/webhook") {
      return new Response("image-to-excel bot is running", { status: 200 });
    }
    if (request.headers.get("x-telegram-bot-api-secret-token") !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response("forbidden", { status: 403 });
    }

    const update = (await request.json()) as TgUpdate;
    const store = new Store(env.DB);
    if (!(await store.claimUpdate(update.update_id))) return new Response("dup");

    // Work happens while the webhook request is open, so there is no 30 s waitUntil cap.
    // Telegram retries are dropped above by update_id.
    const tg = new Telegram(env);
    const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
    try {
      if (chatId === undefined) return new Response("ok");
      if (!allowed(env, chatId)) {
        await tg.sendHtml(chatId, `This bot is private. Your chat id is <code>${chatId}</code>.`);
        return new Response("ok");
      }
      if (update.callback_query) await onCallback(env, tg, store, update.callback_query);
      else if (update.message) await onMessage(env, tg, store, update.message);
    } catch (err) {
      console.error(err);
      if (chatId !== undefined) {
        await tg.sendHtml(chatId, `⚠️ ${escapeHtml(err instanceof Error ? err.message : String(err))}`).catch(() => {});
      }
    }
    return new Response("ok");
  },
} satisfies ExportedHandler<Env>;

function allowed(env: Env, chatId: number) {
  const list = (env.ALLOWED_CHAT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.length === 0 || list.includes(String(chatId));
}

async function onMessage(env: Env, tg: Telegram, store: Store, msg: TgMessage) {
  const chatId = msg.chat.id;
  const text = (msg.text ?? msg.caption ?? "").trim();
  const [cmd, ...rest] = text.split(/\s+/);
  const command = cmd?.startsWith("/") ? cmd.split("@")[0].toLowerCase() : "";

  // Image: compressed photo, or an image sent as a file.
  const photo = msg.photo?.at(-1);
  const doc = msg.document?.mime_type?.startsWith("image/") ? msg.document : undefined;
  if (photo || doc) {
    const fileId = (photo ?? doc)!.file_id;
    const mime = doc?.mime_type ?? "image/jpeg";
    const wantsHq = command === "/hq";
    const instruction = wantsHq ? rest.join(" ") : text;
    await runExtraction(env, tg, store, chatId, fileId, mime, instruction, wantsHq ? "claude" : "workers-ai", msg.message_id);
    return;
  }

  switch (command) {
    case "/start":
    case "/help":
      await tg.sendHtml(chatId, HELP);
      return;
    case "/clear":
      await store.clear(chatId);
      await tg.sendHtml(chatId, "History cleared.");
      return;
    case "/csv":
    case "/tsv":
      await sendFile(tg, store, chatId, command.slice(1) as "csv" | "tsv");
      return;
    case "/hq": {
      const last = await store.getExtraction(chatId);
      if (!last) return void (await tg.sendHtml(chatId, "Send an image first."));
      await runExtraction(env, tg, store, chatId, last.file_id, last.mime, rest.join(" "), "claude");
      return;
    }
  }

  if (!text) return;
  await tg.typing(chatId);
  await store.addMessage(chatId, "user", text);
  const recent = await store.recentExtractions(chatId);
  const context = recent
    .flatMap((r) => r.extraction.tables.map((t, i) => `### Table ${r.id}.${i + 1} ${t.title}\n${toTSV(t)}`))
    .join("\n\n")
    .slice(-24000);
  const answer = await chat(env, context, await store.history(chatId));
  await store.addMessage(chatId, "assistant", answer);
  for (const part of chunkLines(answer)) await tg.sendHtml(chatId, markdownishToHtml(part));
}

async function onCallback(env: Env, tg: Telegram, store: Store, cb: TgCallback) {
  const chatId = cb.message!.chat.id;
  const [action, idStr] = (cb.data ?? "").split(":");
  const id = Number(idStr);
  await tg.answerCallback(cb.id, action === "hq" ? "Re-reading with the HQ model…" : undefined);
  if (action === "csv" || action === "tsv") await sendFile(tg, store, chatId, action, id);
  if (action === "hq") {
    const row = await store.getExtraction(chatId, id);
    if (row) await runExtraction(env, tg, store, chatId, row.file_id, row.mime, "", "claude");
  }
}

async function runExtraction(
  env: Env,
  tg: Telegram,
  store: Store,
  chatId: number,
  fileId: string,
  mime: string,
  instruction: string,
  engine: Engine,
  replyTo?: number,
) {
  if (engine === "claude" && !env.ANTHROPIC_API_KEY) {
    await tg.sendHtml(chatId, "The HQ model is not set up. Add ANTHROPIC_API_KEY as a Worker secret to enable /hq.");
    return;
  }
  await tg.typing(chatId);
  const image = await tg.download(fileId);
  const extraction =
    engine === "claude"
      ? await extractWithClaude(env, image, mime, instruction)
      : await extractWithWorkersAI(env, image, mime, instruction);
  const id = await store.saveExtraction(chatId, fileId, mime, engine, extraction);
  await store.addMessage(chatId, "user", `[sent an image${instruction ? `: ${instruction}` : ""}; extracted as table ${id}]`);
  await sendExtraction(env, tg, chatId, id, extraction, engine, replyTo);
}

async function sendExtraction(env: Env, tg: Telegram, chatId: number, id: number, e: Extraction, engine: Engine, replyTo?: number) {
  if (e.tables.length === 0) {
    await tg.sendHtml(chatId, `No table found.${e.notes ? `\n${escapeHtml(e.notes)}` : ""}`, undefined, replyTo);
    return;
  }

  for (const [i, table] of e.tables.entries()) {
    const tsv = toTSV(table);
    const chunks = chunkLines(tsv);
    const label = [
      table.title ? `<b>${escapeHtml(table.title)}</b>` : e.tables.length > 1 ? `<b>Table ${i + 1}</b>` : "",
      `${table.rows.length} rows × ${table.headers.length} cols`,
      engine === "claude" ? "HQ" : "",
    ]
      .filter(Boolean)
      .join(" · ");

    for (const [c, chunk] of chunks.entries()) {
      const isLast = c === chunks.length - 1;
      const head = chunks.length > 1 ? `${label} · part ${c + 1}/${chunks.length}` : label;
      const buttons: InlineButton[][] = [];
      if (chunk.length <= COPY_BUTTON_LIMIT) buttons.push([{ text: "📋 Copy", copy_text: { text: chunk } }]);
      if (isLast) {
        const row: InlineButton[] = [{ text: "CSV file", callback_data: `csv:${id}` }];
        if (engine !== "claude" && env.ANTHROPIC_API_KEY) row.push({ text: "🔁 Re-read HQ", callback_data: `hq:${id}` });
        buttons.push(row);
      }
      await tg.sendHtml(chatId, `${head}\n<pre>${escapeHtml(chunk)}</pre>`, buttons, c === 0 ? replyTo : undefined);
    }
  }

  if (e.notes) await tg.sendHtml(chatId, `ℹ️ ${escapeHtml(e.notes)}`);
}

async function sendFile(tg: Telegram, store: Store, chatId: number, kind: "csv" | "tsv", id?: number) {
  const row = await store.getExtraction(chatId, id);
  if (!row || row.extraction.tables.length === 0) {
    await tg.sendHtml(chatId, "No table to export yet. Send an image first.");
    return;
  }
  for (const [i, t] of row.extraction.tables.entries()) {
    const suffix = row.extraction.tables.length > 1 ? `-${i + 1}` : "";
    const name = `table-${row.id}${suffix}.${kind}`;
    if (kind === "csv") await tg.sendDocument(chatId, name, toCSV(t), "text/csv");
    else await tg.sendDocument(chatId, name, toTSV(t), "text/tab-separated-values");
  }
}

/** Turn ``` fenced blocks into copyable <pre> blocks; escape everything else. */
function markdownishToHtml(s: string): string {
  return s
    .split(/```[a-zA-Z]*\n?/)
    .map((part, i) => (i % 2 === 1 ? `<pre>${escapeHtml(part.replace(/\n$/, ""))}</pre>` : escapeHtml(part)))
    .join("");
}

interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallback;
}
interface TgMessage {
  message_id: number;
  chat: { id: number };
  text?: string;
  caption?: string;
  photo?: { file_id: string; width: number; height: number }[];
  document?: { file_id: string; mime_type?: string; file_name?: string };
}
interface TgCallback {
  id: string;
  data?: string;
  message?: { chat: { id: number } };
}
