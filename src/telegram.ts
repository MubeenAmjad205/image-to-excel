import type { Env } from "./types.ts";

export type InlineButton =
  | { text: string; callback_data: string }
  | { text: string; copy_text: { text: string } };

/** Telegram limits copy_text buttons to 256 characters. */
export const COPY_BUTTON_LIMIT = 256;

export class Telegram {
  constructor(private env: Env) {}

  private url(method: string) {
    return `https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}/${method}`;
  }

  async call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(this.url(method), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok: boolean; result: T; description?: string };
    if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description}`);
    return json.result;
  }

  sendHtml(chatId: number, html: string, buttons?: InlineButton[][], replyTo?: number) {
    return this.call("sendMessage", {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(buttons?.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
      ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
    });
  }

  typing(chatId: number) {
    return this.call("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
  }

  answerCallback(id: string, text?: string) {
    return this.call("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) }).catch(() => {});
  }

  async sendDocument(chatId: number, filename: string, content: string, mime: string, caption?: string) {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("document", new Blob([content], { type: mime }), filename);
    if (caption) form.append("caption", caption);
    const res = await fetch(this.url("sendDocument"), { method: "POST", body: form });
    const json = (await res.json()) as { ok: boolean; description?: string };
    if (!json.ok) throw new Error(`Telegram sendDocument failed: ${json.description}`);
  }

  /** Download a file by file_id. Bot API limit is 20 MB, plenty for screenshots. */
  async download(fileId: string): Promise<ArrayBuffer> {
    const file = await this.call<{ file_path: string }>("getFile", { file_id: fileId });
    const res = await fetch(`https://api.telegram.org/file/bot${this.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`);
    if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
    return res.arrayBuffer();
  }
}
