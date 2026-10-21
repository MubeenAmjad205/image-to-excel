# Runbook

## First-time setup

```sh
npm install
npx wrangler login
npx wrangler d1 create image-to-excel          # copy database_id into wrangler.jsonc
npm run db:init                                # applies schema.sql to the remote DB
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ANTHROPIC_API_KEY      # optional
npm run deploy
```

Register the webhook. Easiest: run the **Setup Telegram webhook** GitHub Action
(Actions tab, or `gh workflow run setup-webhook.yml`). It calls the Worker's `/setup` route from
GitHub's servers, which registers `/webhook` and the command menu. It needs the repo secret
`TELEGRAM_WEBHOOK_SECRET` (same value as the Worker secret).

From a network that can reach Telegram you can also call it directly:

```sh
curl -X POST -H "x-setup-key: $WEBHOOK_SECRET" https://image-to-excel-bot.image-to-excel-bot.workers.dev/setup
```

Or call Telegram by hand (replace placeholders):

```sh
curl "https://api.telegram.org/bot$TOKEN/setWebhook" \
  -d "url=https://image-to-excel-bot.<subdomain>.workers.dev/webhook" \
  -d "secret_token=$WEBHOOK_SECRET" \
  -d 'allowed_updates=["message","callback_query"]'
```

Check it:

```sh
curl "https://api.telegram.org/bot$TOKEN/getWebhookInfo"
```

`last_error_message` in that output is the first place to look when the bot is silent.

## Production

| Item | Value |
|---|---|
| Worker URL | https://image-to-excel-bot.image-to-excel-bot.workers.dev |
| Webhook path | `/webhook` |
| D1 database | `image-to-excel` |
| Bot | @telco_conveter_bot |
| Webhook secret | Worker secret + GitHub repo secret; local copy in `.dev.vars` (never commit) |

## Everyday

| Task | Command |
|---|---|
| Deploy | `npm run deploy` |
| Live logs | `npx wrangler tail` |
| Change model | edit `VISION_MODEL` in `wrangler.jsonc`, deploy |
| Lock to chat ids | `npx wrangler secret put ALLOWED_CHAT_IDS` (comma-separated). Kept out of the repo |
| Rotate webhook secret | update `.dev.vars`, `wrangler secret put TELEGRAM_WEBHOOK_SECRET`, `gh secret set TELEGRAM_WEBHOOK_SECRET`, then run the setup Action |
| Query D1 | `npx wrangler d1 execute image-to-excel --remote --command "SELECT count(*) FROM tables"` |

## Diagnosing a request

```sh
npx wrangler d1 execute image-to-excel --remote --command \
  "SELECT id, kind, colo, ms, error, datetime(created_at/1000,'unixepoch') FROM events ORDER BY id DESC LIMIT 20"
```

`colo` is the Cloudflare data center that ran the request. `LHE` (Lahore) cannot reach Telegram
reliably. Console output is also kept in Workers Logs (dashboard > Workers > image-to-excel-bot > Logs).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Calls to Telegram hang from Pakistan | `api.telegram.org` is blocked there, including from Cloudflare's Lahore data center (`cf-placement: local-LHE`). Webhook traffic comes from Telegram's servers and runs elsewhere, so the bot works. For admin calls use the GitHub Action, not a local curl. Do not route the bot through a third-party proxy: it would see the bot token |
| Bot silent, `getWebhookInfo` shows 403 | Webhook secret mismatch. Re-run `setWebhook` with the current secret |
| Status message stuck or "Telegram was unreachable" | Cloudflare could not reach Telegram from that colo (seen as 525 or hangs). Check `events.colo`. Retries and timeouts cover short blips |
| Bot silent, 500 errors | Missing secret or D1 schema not applied. Check `wrangler tail` |
| "This bot is private" | Your chat id is not in `ALLOWED_CHAT_IDS` |
| "Model did not return JSON" | Model ignored the schema. Retry, try `/hq`, or change `VISION_MODEL` |
| Columns shifted | Model error. Re-send as a File (sharper), or `/hq` |
| Paste lands in one column | Tabs lost on copy in that client. Use `/tsv` |
| Workers AI 429 / quota error | Free daily allocation used up. Resets daily at 00:00 UTC |

## Schema changes

Add the change to `schema.sql` using `IF NOT EXISTS` or `ADD COLUMN`, then run `npm run db:init`.
It is safe to re-run.
