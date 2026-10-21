# Architecture

## Components

| Component | Role |
|---|---|
| Telegram Bot API | Delivers updates to the webhook, receives replies |
| Cloudflare Worker (`src/index.ts`) | Single HTTP endpoint `POST /webhook` |
| Workers AI, `VISION_MODEL` | Default engine: image to JSON table, and chat answers |
| Claude API (optional) | Second engine for `/hq` re-reads. Off unless `ANTHROPIC_API_KEY` is set |
| `POST /setup` | Admin route, header `x-setup-key`. Registers the webhook and command menu |
| D1 (SQLite) | Processed update ids, extracted tables, chat history |

## Request flow

1. Telegram POSTs an update to `/webhook` with the `x-telegram-bot-api-secret-token` header.
   Requests without the correct secret get 403.
2. `claimUpdate` inserts the `update_id` into D1. If it already exists, the update is a retry and is dropped.
3. If `ALLOWED_CHAT_IDS` is set and the chat is not in it, the bot replies with the chat id and stops.
4. Routing:
   - **Image** (photo, or document with an `image/*` type): download via `getFile`, base64 it,
     send it to the engine with the system prompt from `src/types.ts` and the caption as an instruction.
     The model must return JSON that matches `EXTRACTION_SCHEMA`.
     `normalizeTable` pads ragged rows. The result is saved to D1 and sent back.
   - **Command**: `/start`, `/help`, `/csv`, `/tsv`, `/hq`, `/clear`.
   - **Plain text**: the last 3 extractions, as TSV, go into the system prompt, plus the last 12 messages.
   - **Button press** (`callback_query`): `csv:<id>` sends a file, `hq:<id>` re-reads with Claude.
5. The Worker does the work while the webhook request is open, then returns 200.
   This avoids the 30 second `waitUntil` limit. Duplicate deliveries are handled by step 2.

## Reply format

Each table is sent as an HTML message with a `<pre>` block of TSV. Telegram clients show a copy
control on `<pre>` blocks. Tables of 256 characters or fewer also get a `copy_text` button, which
is Telegram's limit for that button. Long tables are split on row boundaries into messages under
4096 characters. The header row appears in the first part only, so pasting the parts in order
rebuilds the table.

## Data model (D1)

| Table | Columns | Notes |
|---|---|---|
| `updates` | `update_id`, `created_at` | Dedup. Grows forever; prune later (see plan) |
| `tables` | `id`, `chat_id`, `file_id`, `mime`, `data` (JSON `Extraction`), `engine`, `created_at` | `file_id` lets `/hq` re-download the image without storing it |
| `messages` | `id`, `chat_id`, `role`, `content`, `created_at` | Chat history |

Images are never stored. Telegram keeps them and `file_id` fetches them again.

## Configuration

| Name | Kind | Purpose |
|---|---|---|
| `VISION_MODEL` | var | Workers AI model id with vision input |
| `ALLOWED_CHAT_IDS` | var | Comma-separated chat ids. Empty means anyone |
| `TELEGRAM_BOT_TOKEN` | secret | From @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | secret | Shared secret checked on every webhook call |
| `ANTHROPIC_API_KEY` | secret, optional | Enables `/hq` |
