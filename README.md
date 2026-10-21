# Image to Excel Telegram bot

Send a photo of a table to the bot. It replies with the table as tab-separated text that
pastes straight into Excel or Google Sheets as separate cells. Files are only made when you ask.

Runs on a free Cloudflare Worker. Image reading uses a free Workers AI vision model
(`VISION_MODEL` in `wrangler.jsonc`). Claude is an optional second engine behind `/hq`.

## Using the bot

| You send | Bot does |
|---|---|
| Photo or image file | Replies with the table in a copyable block, plus 📋 Copy (short tables) and CSV file buttons |
| Photo with a caption | Uses the caption as an instruction, e.g. `split RRU QTY by +` |
| Plain text | Answers questions about your recent tables |
| `/csv`, `/tsv` | Sends the last table as a file |
| `/hq` | Re-reads the last image with Claude (needs `ANTHROPIC_API_KEY`) |
| `/clear` | Forgets history |

Send big tables as a **File**, not a Photo. Telegram compresses photos, which blurs small text.

To paste: tap the grey block to copy it, click cell A1 in Excel, paste.

## Setup

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy its token.
2. Install and log in:
   ```sh
   npm install
   npx wrangler login
   ```
3. Create the database, put the printed `database_id` into `wrangler.jsonc`, then create the tables:
   ```sh
   npx wrangler d1 create image-to-excel
   npm run db:init
   ```
4. Add secrets:
   ```sh
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET     # any long random string
   npx wrangler secret put ANTHROPIC_API_KEY           # optional, enables /hq
   ```
5. Deploy and point Telegram at the Worker:
   ```sh
   npm run deploy
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://image-to-excel-bot.<your-subdomain>.workers.dev/webhook" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
     -d 'allowed_updates=["message","callback_query"]'
   ```
6. Send `/start` to the bot. To lock it to yourself, put your chat id
   (the bot shows it to strangers) in the `ALLOWED_CHAT_IDS` secret: `npx wrangler secret put ALLOWED_CHAT_IDS`.

## Changing the vision model

Set `VISION_MODEL` to any Workers AI model with vision input, then redeploy. Test the new model
on a few real screenshots first. Check that empty cells stay in the right column and that codes
like `R8881 S9000(B8B)` come through exactly.

## Files

- `src/index.ts` handles Telegram updates, commands and replies
- `src/extract.ts` calls Workers AI (default) or Claude (`/hq`)
- `src/format.ts` builds TSV/CSV, splits long tables, parses model JSON
- `src/store.ts` keeps tables and chat history in D1
- `schema.sql` creates the D1 tables

Project docs, rules and plan live in [docs/](docs/). Agents start at [AGENTS.md](AGENTS.md).
