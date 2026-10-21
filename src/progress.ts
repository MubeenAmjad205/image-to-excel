import { escapeHtml } from "./format.ts";
import type { InlineButton, Telegram } from "./telegram.ts";

/**
 * One status message per request that is edited in place as work moves on,
 * then replaced by the final answer. Keeps the "typing…" indicator alive and
 * shows elapsed seconds during long steps, so the user always sees progress.
 */
export class Progress {
  private messageId?: number;
  private chain: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setInterval>;
  private readonly started = Date.now();
  private stepStarted = Date.now();
  private finished = false;

  private tg: Telegram;
  private chatId: number;
  private replyTo?: number;

  private constructor(tg: Telegram, chatId: number, replyTo?: number) {
    this.tg = tg;
    this.chatId = chatId;
    this.replyTo = replyTo;
  }

  static async start(tg: Telegram, chatId: number, text: string, replyTo?: number): Promise<Progress> {
    const p = new Progress(tg, chatId, replyTo);
    await tg.typing(chatId);
    try {
      p.messageId = (await tg.sendHtml(chatId, text, undefined, replyTo)).message_id;
    } catch (e) {
      console.error("progress start failed", e);
    }
    return p;
  }

  /** Seconds since the request started. */
  get elapsed(): number {
    return Math.round((Date.now() - this.started) / 1000);
  }

  /** Show a new step. With `tick`, the message also counts seconds every few seconds. */
  step(text: string, tick = false) {
    this.stopTimer();
    this.stepStarted = Date.now();
    this.edit(text);
    if (tick) {
      this.timer = setInterval(() => {
        const s = Math.round((Date.now() - this.stepStarted) / 1000);
        this.edit(`${text} <i>${s}s</i>`);
        void this.tg.typing(this.chatId);
      }, 6000);
    }
  }

  /** Replace the status message with the final answer (or send it if editing fails). */
  async done(html: string, buttons?: InlineButton[][]) {
    this.finish();
    await this.chain;
    if (this.messageId) {
      try {
        await this.tg.editHtml(this.chatId, this.messageId, html, buttons);
        return;
      } catch (e) {
        console.error("progress final edit failed", e);
      }
    }
    await this.tg.sendHtml(this.chatId, html, buttons, this.replyTo);
  }

  async fail(err: unknown) {
    await this.done(`⚠️ ${escapeHtml(friendlyError(err))}`);
  }

  private finish() {
    this.finished = true;
    this.stopTimer();
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Edits are queued so they never overtake each other or the final answer. */
  private edit(text: string) {
    if (!this.messageId) return;
    const id = this.messageId;
    this.chain = this.chain.then(() =>
      this.finished ? undefined : this.tg.editHtml(this.chatId, id, text).catch((e) => console.error("progress edit failed", e)),
    );
  }
}

/** Turn internal errors into something the user can act on. */
export function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/did not return JSON|Unexpected token|JSON/i.test(msg)) {
    return "I couldn't read a clean table from this image. Try sending it as a File (not Photo), or crop it to just the table.";
  }
  if (/neuron|quota|daily|limit exceeded|4006|429/i.test(msg)) {
    return "The free AI limit for today is used up. It resets at 05:00 Pakistan time (00:00 UTC).";
  }
  if (/Could not reach Telegram/i.test(msg)) return "Telegram was unreachable for a moment. Please send it again.";
  if (/declined/i.test(msg)) return "The HQ model declined this image.";
  return `Something went wrong: ${msg}`;
}
