# Testing

## Unit tests

`npm test` runs `test/*.test.ts` with Node's built-in type stripping. Cover pure functions:
TSV/CSV building, padding, chunking, JSON parsing, base64. Add a test with any change to `src/format.ts`.

## Accuracy check (manual, before changing prompt, schema or model)

Keep real screenshots in `samples/` (git-ignored). For each image, send it to the bot and record:

| Image | Engine / model | Rows expected | Rows got | Wrong cells | Shifted cells | Notes |
|---|---|---|---|---|---|---|
| sites-tracker.png | workers-ai / llama-4-scout | 11 | | | | empty Remarks on SITE166 |
| asp-positions.png | workers-ai / llama-4-scout | 12 | | | | filter count "12" must be ignored |

Pass bar: zero shifted cells, and at most 1 wrong cell per 100.

Things that break models most often: empty cells mid-row, `0`/`O` and `8`/`B` in codes,
composite cells with `+` and `*`, header filter decorations.

## Paste check

On each client you use (iOS, Android, Desktop), copy a reply block and paste into Excel A1.
Each value must land in its own column.
