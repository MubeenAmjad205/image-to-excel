# Model evaluation

How the default vision model was chosen. Re-run before changing `VISION_MODEL`,
`EXTRACTION_PROMPT` or `EXTRACTION_SCHEMA`.

## Method

`npm run eval` sends every `samples/<name>.png` that has a hand-checked
`samples/<name>.expected.tsv` to each model, with the bot's own system prompt and JSON schema,
then compares every cell exactly (case, spaces and punctuation count). Samples are real work
screenshots and stay out of git. Reports are written to `samples/results/`.

Samples used (2026-10-21):

| Sample | Shape | What makes it hard |
|---|---|---|
| Site tracker | 11 rows × 9 cols, 1472×289 px | Coloured rows, filter icons, empty cells mid-row, long `+`-joined equipment codes |
| ASP positions | 12 rows × 3 cols, 340×281 px | Filter count row above the header, codes like `R8881 S9000(B8B)(51.1.1)` |

## Results (one run each, temperature 0)

| Model | Site tracker wrong cells | ASP positions wrong cells | Total | Time per image |
|---|---|---|---|---|
| **Llama 4 Scout 17B** (default) | 1 / 108 | 0 / 39 | **1 / 147** | 26–53 s |
| Gemma 4 26B | 1 / 108 | 0 / 39 | 1 / 147 | 31–141 s |
| Qwen 3.8 27B | 1 / 108 | 2 / 39 | 3 / 147 | 24–39 s |
| Mistral Small 3.1 24B | no JSON | timeout | – | > 160 s |
| DeepSeek V4.1 Flash | – | – | not on Workers Free plan | – |
| GLM 5.3 Flash | – | – | not on Workers Free plan | – |
| Llama 3.2 11B Vision | – | – | needs a licence acceptance call first | – |

Error types seen: one cell left empty (Llama 4 Scout), a header cut short (Gemma 4),
one letter wrong in a name and in two equipment codes (Qwen 3.8).

## Findings

- **Llama 4 Scout stays the default**: joint best accuracy and the most consistent speed.
  See [decision 0006](decisions/0006-default-vision-model.md).
- The two cells missing in the first live test were read correctly from the full-quality PNG.
  Telegram recompresses images sent as *Photo*, so the bot's help text recommends sending *File*.
- Accuracy is high but not perfect (about 99.3 % of cells). The viewer shows the table so the user
  can glance-check it, and `/hq` re-reads with Claude when a table matters.
- One run per model is a small sample. Model output varies between runs; add more samples and
  repeat runs before reading much into differences of one cell.
