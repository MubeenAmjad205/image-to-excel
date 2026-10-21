# Architecture

## Components

| Component | Role |
|---|---|
| Telegram Bot API | Delivers updates to the webhook, receives replies |
| Cloudflare Worker (`src/index.ts`) | Single HTTP endpoint `POST /webhook` |
| Workers AI, `VISION_MODEL` | Default engine: image to JSON table, and chat answers |
| Claude API (optional) | Second engine for `/hq` re-reads. Off unless `ANTHROPIC_API_KEY` is set |
| `GET /t/<token>` | Table viewer page (Mini App). Grid + Copy table + CSV. Token is 144-bit random, stored in `shares` |
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

See [decision 0005](decisions/0005-table-viewer-page.md). The chat reply is a short summary
(name, rows × cols, column names, notes) with buttons:

- **📊 Open & copy** opens `/t/<token>`: a Telegram Mini App in private chats, a normal link in groups.
  The page shows the grid. **Copy table** writes both `text/html` and `text/plain` (TSV) to the
  clipboard, so Excel, Sheets and Numbers paste real cells. The HTML marks cells as text
  (`mso-number-format:'\@'`) so Excel keeps values like `51.1.1` as typed.
- **CSV file** sends a `.csv` document.
- **🔁 Re-read HQ** when `ANTHROPIC_API_KEY` is set.

Chat answers that contain a TSV code block are parsed (`parseTSV`), stored as a table with
engine `chat` and an empty `file_id`, and get the same buttons.

## Data model (D1)

| Table | Columns | Notes |
|---|---|---|
| `updates` | `update_id`, `created_at` | Dedup. Grows forever; prune later (see plan) |
| `tables` | `id`, `chat_id`, `file_id`, `mime`, `data` (JSON `Extraction`), `engine`, `created_at` | `file_id` lets `/hq` re-download the image without storing it |
| `shares` | `token`, `table_id`, `chat_id`, `created_at` | Viewer links. Anyone with the link can view that table |
| `messages` | `id`, `chat_id`, `role`, `content`, `created_at` | Chat history |

Images are never stored. Telegram keeps them and `file_id` fetches them again.

## Configuration

| Name | Kind | Purpose |
|---|---|---|
| `PUBLIC_URL` | var | Worker base URL used in viewer links |
| `VISION_MODEL` | var | Workers AI model id with vision input |
| `ALLOWED_CHAT_IDS` | secret, optional | Comma-separated chat ids. Empty means anyone |
| `TELEGRAM_BOT_TOKEN` | secret | From @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | secret | Shared secret checked on every webhook call |
| `ANTHROPIC_API_KEY` | secret, optional | Enables `/hq` |
