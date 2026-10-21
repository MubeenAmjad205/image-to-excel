# Rules

These are hard rules for anyone, human or agent, changing this repo.

## Data accuracy

1. Never "clean up" extracted values in code: no trimming of inner spaces, no case changes, no
   number parsing, no date conversion. The cell text is the product. `normalizeTable` only trims
   the outer whitespace and pads missing cells.
2. Never shift cells to fill gaps. Missing cells are padded at the end of the row, and the prompt
   tells the model to emit `""` in place.
3. Any change to `EXTRACTION_PROMPT`, `EXTRACTION_SCHEMA` or `VISION_MODEL` must be checked against
   the sample set in [testing.md](testing.md) before merging. Note the result in the PR.

## Output

4. The default reply is TSV in a `<pre>` block. Do not make files unless the user asks
   (`/csv`, `/tsv` or a button).
5. Every string that goes into a Telegram HTML message passes through `escapeHtml`.
6. Respect Telegram limits: 4096 characters per message, 256 for `copy_text`, 64 bytes for `callback_data`.

## Platform

7. Must run on the Cloudflare Workers free plan. No Node-only APIs (use Web APIs: `fetch`, `btoa`,
   `Blob`, `FormData`). No packages that need a native binary or a large WASM file.
8. Workers AI is the default engine. Paid APIs (Claude) are opt-in per request through `/hq` and
   must stay optional: the bot must work with no `ANTHROPIC_API_KEY`.
9. Claude calls use the official `@anthropic-ai/sdk`, model `claude-opus-5-5`, structured output via
   `output_config.format`, and must check `stop_reason` for `refusal` and `max_tokens`.

## Security and privacy

10. Never commit secrets, `.dev.vars`, real chat ids or real sample images. The repo is public.
11. The webhook must reject requests without the correct secret header.
12. Do not log image bytes or full extracted tables. Log ids and error messages only.

## Code

13. TypeScript strict mode. `npm run typecheck` and `npm test` must pass.
14. Keep pure logic in `src/format.ts` (or another side-effect-free module) and test it in `test/`.
15. D1 schema changes are additive (`CREATE ... IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN`) and
    go in `schema.sql` plus a note in the runbook.
16. Small focused commits with imperative messages ("Add /hq button", not "updates").
