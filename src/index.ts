import { chat, extractWithClaude, extractWithWorkersAI, type Engine } from "./extract.ts";
import { chunkLines, escapeHtml, parseTSV, summarize, toCSV, toTSV } from "./format.ts";
import { renderTablePage } from "./page.ts";
import { Store } from "./store.ts";
import { Telegram, type InlineButton } from "./telegram.ts";
import type { Env, Extraction } from "./types.ts";

const HELP = `<b>Send me a photo of a table.</b> I reply with the table ready to paste into Excel or Google Sheets.

<b>How to copy</b>
Tap <b>📊 Open &amp; copy</b> under the reply, then <b>Copy table</b>, then paste into cell A1.
Every value lands in its own column.

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
    if (url.pathname === "/setup") return setup(request, env, url);
    const view = url.pathname.match(/^\/t\/([A-Za-z0-9_-]{16,64})$/);
    if (view && request.method === "GET") return viewTable(env, view[1]);
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

/**
 * POST /setup with header `x-setup-key: <TELEGRAM_WEBHOOK_SECRET>`.
 * Registers this Worker's /webhook with Telegram and sets the command menu.
 * Runs from Cloudflare, so it works even where api.telegram.org is blocked locally.
 */
async function setup(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== "POST" || request.headers.get("x-setup-key") !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const tg = new Telegram(env);
  const me = await tg.call<{ username: string }>("getMe", {});
  await tg.call("setWebhook", {
    url: `${url.origin}/webhook`,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  await tg.call("setMyCommands", {
    commands: [
      { command: "help", description: "How to use the bot" },
      { command: "csv", description: "Last table as a .csv file" },
      { command: "tsv", description: "Last table as a .tsv file" },
      { command: "hq", description: "Re-read last image with the HQ model" },
      { command: "clear", description: "Forget history" },
    ],
  });
  const info = await tg.call<Record<string, unknown>>("getWebhookInfo", {});
  return Response.json({ bot: me.username, webhook: info });
}

/** GET /t/<token>: the table viewer page. The token is the only key, so it is long and random. */
async function viewTable(env: Env, token: string): Promise<Response> {
  const row = await new Store(env.DB).getShared(token);
  const headers = {
    "cache-control": "private, no-store",
    "x-robots-tag": "noindex",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  };
  if (!row) return new Response("Table not found or deleted.", { status: 404, headers });
  return new Response(renderTablePage(row.extraction), {
    headers: { ...headers, "content-type": "text/html; charset=utf-8" },
  });
}

/** Mini App button in private chats (opens inside Telegram); plain link elsewhere. */
function openButton(env: Env, chatId: number, token: string): InlineButton {
  const url = `${env.PUBLIC_URL}/t/${token}`;
  return chatId > 0 ? { text: "📊 Open & copy", web_app: { url } } : { text: "📊 Open & copy", url };
}

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
      const last = await store.getExtraction(chatId, undefined, true);
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

  // Tables the model wrote as TSV code blocks become real tables with an Open & copy button.
  const tables = [...answer.matchAll(/```[a-zA-Z]*\n?([\s\S]*?)```/g)].map((m) => parseTSV(m[1])).filter((t) => t !== null);
  if (tables.length) {
    const text = answer.replace(/```[a-zA-Z]*\n?[\s\S]*?```/g, "").trim();
    if (text) for (const part of chunkLines(text)) await tg.sendHtml(chatId, escapeHtml(part));
    const extraction: Extraction = { tables, notes: "" };
    const id = await store.saveExtraction(chatId, "", "", "chat", extraction);
    await sendExtraction(env, tg, store, chatId, id, extraction, "chat");
    return;
  }
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
  await sendExtraction(env, tg, store, chatId, id, extraction, engine, replyTo);
}

async function sendExtraction(
  env: Env,
  tg: Telegram,
  store: Store,
  chatId: number,
  id: number,
  e: Extraction,
  engine: Engine | "chat",
  replyTo?: number,
) {
  if (e.tables.length === 0) {
    await tg.sendHtml(chatId, `No table found.${e.notes ? `\n${escapeHtml(e.notes)}` : ""}`, undefined, replyTo);
    return;
  }

  const token = await store.createShare(chatId, id);
  const lines = e.tables.map((t, i) => {
    const name = t.title || (e.tables.length > 1 ? `Table ${i + 1}` : "Table");
    return `✅ <b>${escapeHtml(name)}</b> · ${t.rows.length} rows × ${t.headers.length} cols${engine === "claude" ? " · HQ" : ""}\n<i>${escapeHtml(summarize(t))}</i>`;
  });
  if (e.notes) lines.push(`ℹ️ ${escapeHtml(e.notes)}`);

  const actions: InlineButton[] = [{ text: "CSV file", callback_data: `csv:${id}` }];
  if (engine === "workers-ai" && env.ANTHROPIC_API_KEY) actions.push({ text: "🔁 Re-read HQ", callback_data: `hq:${id}` });
  const html = lines.join("\n\n");
  await tg.sendHtml(chatId, html.length > 4000 ? html.slice(0, 4000) + "…" : html, [[openButton(env, chatId, token)], actions], replyTo);
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
