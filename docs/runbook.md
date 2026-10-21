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

Register the webhook (replace placeholders):

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

## Everyday

| Task | Command |
|---|---|
| Deploy | `npm run deploy` |
| Live logs | `npx wrangler tail` |
| Change model | edit `VISION_MODEL` in `wrangler.jsonc`, deploy |
| Lock to chat ids | edit `ALLOWED_CHAT_IDS`, deploy |
| Rotate webhook secret | `wrangler secret put TELEGRAM_WEBHOOK_SECRET`, then re-run `setWebhook` with the new value |
| Query D1 | `npx wrangler d1 execute image-to-excel --remote --command "SELECT count(*) FROM tables"` |

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Bot silent, `getWebhookInfo` shows 403 | Webhook secret mismatch. Re-run `setWebhook` with the current secret |
| Bot silent, 500 errors | Missing secret or D1 schema not applied. Check `wrangler tail` |
| "This bot is private" | Your chat id is not in `ALLOWED_CHAT_IDS` |
| "Model did not return JSON" | Model ignored the schema. Retry, try `/hq`, or change `VISION_MODEL` |
| Columns shifted | Model error. Re-send as a File (sharper), or `/hq` |
| Paste lands in one column | Tabs lost on copy in that client. Use `/tsv` |
| Workers AI 429 / quota error | Free daily allocation used up. Resets daily at 00:00 UTC |

## Schema changes

Add the change to `schema.sql` using `IF NOT EXISTS` or `ADD COLUMN`, then run `npm run db:init`.
It is safe to re-run.
