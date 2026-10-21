import assert from "node:assert/strict";
import { Progress, friendlyError } from "../src/progress.ts";
import { Telegram } from "../src/telegram.ts";
import type { Env } from "../src/types.ts";

const env = { TELEGRAM_BOT_TOKEN: "t" } as Env;
const realFetch = globalThis.fetch;
const mockFetch = (responses: (() => Response)[]) => {
  let i = 0;
  const calls: { method: string; body: any }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ method: String(url).split("/").pop()!, body: init?.body ? JSON.parse(String(init.body)) : null });
    return responses[Math.min(i++, responses.length - 1)]();
  }) as typeof fetch;
  return calls;
};
const ok = (result: unknown = { message_id: 7 }) => () => Response.json({ ok: true, result });

// Retries the Cloudflare 525 seen in production, then succeeds.
{
  const calls = mockFetch([() => new Response("error code: 525\n", { status: 525 }), ok()]);
  const msg = await new Telegram(env).sendHtml(1, "hi");
  assert.equal(msg.message_id, 7);
  assert.equal(calls.length, 2);
}

// Gives up after 4 attempts with a clear error.
{
  const calls = mockFetch([() => new Response("error code: 525\n", { status: 525 })]);
  await assert.rejects(new Telegram(env).sendHtml(1, "hi"), /Could not reach Telegram \(HTTP 525/);
  assert.equal(calls.length, 4);
}

// 4xx is not retried.
{
  const calls = mockFetch([() => Response.json({ ok: false, description: "Bad Request: chat not found" }, { status: 400 })]);
  await assert.rejects(new Telegram(env).sendHtml(1, "hi"), /chat not found/);
  assert.equal(calls.length, 1);
}

// "message is not modified" is not an error.
{
  mockFetch([() => Response.json({ ok: false, description: "Bad Request: message is not modified" }, { status: 400 })]);
  await new Telegram(env).editHtml(1, 2, "same");
}

// Progress: status message is sent, edited per step, then replaced by the final answer.
{
  const calls = mockFetch([ok()]);
  const p = await Progress.start(new Telegram(env), 1, "📥 Downloading…");
  p.step("🔎 Reading…");
  await new Promise((r) => setTimeout(r, 10)); // the model call happens here in real runs
  await p.done("✅ Table", [[{ text: "x", callback_data: "y" }]]);
  const methods = calls.map((c) => c.method);
  assert.deepEqual(methods, ["sendChatAction", "sendMessage", "editMessageText", "editMessageText"]);
  const final = calls.at(-1)!.body;
  assert.equal(final.text, "✅ Table");
  assert.equal(final.message_id, 7);
  assert.equal(final.reply_markup.inline_keyboard[0][0].text, "x");
}

// Progress: a step edit still queued when the answer is ready is skipped (no stale status).
{
  const calls = mockFetch([ok()]);
  const p = await Progress.start(new Telegram(env), 1, "📥");
  p.step("🔎 Reading…");
  await p.done("✅ Table");
  assert.deepEqual(calls.map((c) => c.method), ["sendChatAction", "sendMessage", "editMessageText"]);
  assert.equal(calls.at(-1)!.body.text, "✅ Table");
}

// Progress: if editing fails, the final answer is sent as a new message.
{
  const calls = mockFetch([ok(), ok(), () => Response.json({ ok: false, description: "Bad Request: message to edit not found" }, { status: 400 }), ok()]);
  const p = await Progress.start(new Telegram(env), 1, "📥");
  await p.done("✅ Table");
  assert.equal(calls.at(-1)!.method, "sendMessage");
  assert.equal(calls.at(-1)!.body.text, "✅ Table");
}

assert.match(friendlyError(new Error("Model did not return JSON")), /send.*as a File/);
assert.match(friendlyError(new Error("4006: you have used up your daily free allocation of 10,000 neurons")), /free AI limit/);
assert.match(friendlyError(new Error("boom")), /Something went wrong: boom/);

globalThis.fetch = realFetch;
console.log("telegram tests passed");
