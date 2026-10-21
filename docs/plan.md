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

## Phase 2 – Deploy 🔄

- ✅ Create D1 database `image-to-excel` (WEUR) and apply schema
- ✅ Deploy Worker to `https://image-to-excel-bot.image-to-excel-bot.workers.dev`
- ✅ Generate `TELEGRAM_WEBHOOK_SECRET` and store it as a Worker secret (local copy in git-ignored `.dev.vars`)
- ✅ Add `TELEGRAM_BOT_TOKEN` secret
- ✅ Register webhook and command menu via the setup GitHub Action (Telegram is blocked from the owner's network and from Cloudflare's Lahore colo)
- ✅ Smoke test: `/start` and the site-tracker sample worked end to end (2026-10-21)
- ✅ Set `ALLOWED_CHAT_IDS` to the owner's chat id

## Phase 2b – Output format ✅

- ✅ Replace TSV-in-chat with summary + **Open & copy** viewer page ([0005](decisions/0005-table-viewer-page.md))
- ✅ Chat answers with TSV blocks become tables with the same buttons
- ⏳ Owner to confirm paste into Excel from Telegram Desktop and phone

## Phase 3 – Accuracy check ⏳

First result, Llama 4 Scout on the site-tracker sample sent as a compressed Photo: 9 columns and 11 rows
correct, 2 cells missing (Team for SITE133 "Team Amber" and SITE166 "Team Lime" came back empty).


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
- Expire viewer links (`shares`) after N days.
- Verify targeted placement (`placement.hostname = api.telegram.org`) takes effect; drop it if it never does.
- `/model` command to show the active engine and model.

## Phase 5 – Maybe 💤

- Google Sheets append via service account.
- Batch: several images into one combined table.
