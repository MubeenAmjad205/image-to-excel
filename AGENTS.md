# Agent guide

Instructions for AI coding agents (Claude Code, Codex, Cursor, etc.) and humans working on this repo.

## What this is

A Telegram bot on a Cloudflare Worker. A user sends a photo of a table, the bot replies with
tab-separated text that pastes into Excel as cells. Plain-text messages are questions about the
extracted data. Full background: [docs/context.md](docs/context.md).

## Read before changing code

1. [docs/rules.md](docs/rules.md) – hard rules. Follow them.
2. [docs/architecture.md](docs/architecture.md) – how a message flows through the code.
3. [docs/plan.md](docs/plan.md) – current phase and what is next. Update it when you finish work.
4. [docs/decisions/](docs/decisions/) – why things are the way they are. Do not reverse a decision
   without writing a new record that supersedes it.

## Commands

```sh
npm install
npm run typecheck      # must pass
npm test               # must pass
npm run dev            # local Worker (uses real Workers AI, needs `wrangler login`)
npm run deploy         # production
npm run eval           # model accuracy on samples/ (see docs/evaluation.md)
npx wrangler tail      # live logs
```

## Layout

| Path | Purpose |
|---|---|
| `src/index.ts` | Webhook entry, commands, replies |
| `src/extract.ts` | Image to table (Workers AI default, Claude on `/hq`), chat |
| `src/format.ts` | TSV/CSV, chunking, JSON parsing, base64. Pure functions, unit tested |
| `src/store.ts` | D1 access |
| `src/telegram.ts` | Telegram Bot API client |
| `src/types.ts` | Env, table types, extraction prompt and JSON schema |
| `schema.sql` | D1 schema. Additive changes only |
| `test/` | Node tests for pure code and Telegram retry/progress logic |
| `scripts/eval.ts` | Model accuracy harness |
| `docs/` | Context, rules, plan, runbook, decisions |

## Definition of done

- Typecheck and tests pass.
- New pure logic has a test in `test/`.
- Docs touched by the change are updated, including `docs/plan.md` status.
- No secrets, tokens, chat ids or real customer images in the diff.
