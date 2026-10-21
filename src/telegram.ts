import type { Env } from "./types.ts";

export type InlineButton =
  | { text: string; callback_data: string }
  | { text: string; copy_text: { text: string } }
  | { text: string; web_app: { url: string } }
  | { text: string; url: string };

export interface SentMessage {
  message_id: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch with retries for transient failures: network errors, 5xx (Cloudflare 52x included),
 * 429 (honours retry_after) and non-JSON bodies. 4xx errors are returned immediately.
 * Cloudflare-to-Telegram connections fail intermittently with 525 from some locations.
 */
async function fetchJson<T>(url: string, init: RequestInit, attempts = 4, timeoutMs = 10_000): Promise<TgResponse<T>> {
  let lastErr = "";
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(400 * 2 ** (i - 1));
    let res: Response;
    try {
      // Per-attempt timeout: from some locations the connection hangs instead of failing.
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      continue;
    }
    const body = await res.text();
    let json: TgResponse<T>;
    try {
      json = JSON.parse(body);
    } catch {
      lastErr = `HTTP ${res.status}: ${body.slice(0, 80).trim()}`;
      continue;
    }
    if (res.status === 429 && i < attempts - 1) {
      await sleep(Math.min((json.parameters?.retry_after ?? 1) * 1000, 10_000));
      continue;
    }
    if (res.status >= 500) {
      lastErr = `HTTP ${res.status}: ${json.description ?? ""}`;
      continue;
    }
    return json;
  }
  throw new Error(`Could not reach Telegram (${lastErr})`);
}

interface TgResponse<T> {
  ok: boolean;
  result: T;
  description?: string;
  parameters?: { retry_after?: number };
}

export class Telegram {
  private env: Env;
  constructor(env: Env) {
    this.env = env;
  }

  private url(method: string) {
    return `https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}/${method}`;
  }

  async call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
    const json = await fetchJson<T>(this.url(method), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description}`);
    return json.result;
  }

  sendHtml(chatId: number, html: string, buttons?: InlineButton[][], replyTo?: number): Promise<SentMessage> {
    return this.call<SentMessage>("sendMessage", {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(buttons?.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
      ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
    });
  }

  /** Edit a message in place. "message is not modified" is not an error. */
  async editHtml(chatId: number, messageId: number, html: string, buttons?: InlineButton[][]): Promise<void> {
    try {
      await this.call("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: html,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: { inline_keyboard: buttons ?? [] },
      });
    } catch (e) {
      if (!(e instanceof Error && e.message.includes("message is not modified"))) throw e;
    }
  }

  typing(chatId: number, action: "typing" | "upload_document" = "typing") {
    return this.call("sendChatAction", { chat_id: chatId, action }).catch(() => {});
  }

  /** Small popup ("toast") on the user's screen after they press an inline button. */
  answerCallback(id: string, text?: string) {
    return this.call("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) }).catch(() => {});
  }

  async sendDocument(chatId: number, filename: string, content: string, mime: string, caption?: string) {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("document", new Blob([content], { type: mime }), filename);
    if (caption) form.append("caption", caption);
    const json = await fetchJson(this.url("sendDocument"), { method: "POST", body: form });
    if (!json.ok) throw new Error(`Telegram sendDocument failed: ${json.description}`);
  }

  /** Download a file by file_id. Bot API limit is 20 MB, plenty for screenshots. */
  async download(fileId: string): Promise<ArrayBuffer> {
    const file = await this.call<{ file_path: string }>("getFile", { file_id: fileId });
    const url = `https://api.telegram.org/file/bot${this.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    for (let i = 0; i < 4; i++) {
      if (i > 0) await sleep(400 * 2 ** (i - 1));
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        if (res.ok) return await res.arrayBuffer();
        if (res.status < 500) throw new Error(`Telegram file download failed: ${res.status}`);
      } catch (e) {
        if (i === 3) throw e;
      }
    }
    throw new Error("Telegram file download failed");
  }
}
