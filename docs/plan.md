# Plan

Status key: ✅ done · 🔄 in progress · ⏳ next · 💤 later

## Phase 0 – Scaffold ✅

- ✅ Worker, Telegram client, Workers AI extraction, Claude `/hq` fallback
- ✅ TSV reply with copy block and copy button, CSV/TSV files on request
- ✅ D1 store for tables, history and update dedup
- ✅ Unit tests for formatting helpers, typecheck, bundle dry run

## Phase 1 – Docs and repo ✅

- ✅ Agent guide, rules, context, architecture, decisions, runbook, testing docs
- ✅ Public GitHub repo, CI for typecheck and tests

## Phase 2 – Deploy ⏳

- ⏳ Create D1 database and apply schema
- ⏳ Generate webhook secret, deploy Worker
- ⏳ Add `TELEGRAM_BOT_TOKEN` secret (needs the token from @BotFather)
- ⏳ Register webhook, smoke test `/start`
- ⏳ Set `ALLOWED_CHAT_IDS` to the owner's chat id

## Phase 3 – Accuracy check ⏳

- Run the two sample screenshots and 5 to 10 more real ones through the bot.
- Record per image: cells wrong, empty-cell shifts, rows missed (template in [testing.md](testing.md)).
- If Llama 4 Scout misses more than about 1 cell in 100, try other free vision models in the
  Workers AI catalog and compare on the same set.
- Confirm tabs survive copy from `<pre>` on Telegram iOS, Android and Desktop.
  If not, consider sending TSV as the copy-button payload in 256-char chunks, or a file by default.

## Phase 4 – Quality of life 💤

- Caption shortcuts: `split <column> by <sep>`, `keep rows where ...`.
- Optional status column from row colour.
- Prune `updates` rows older than 7 days on a cron trigger.
- `/model` command to show the active engine and model.

## Phase 5 – Maybe 💤

- Google Sheets append via service account.
- Batch: several images into one combined table.
