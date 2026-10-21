# 0006 – Default vision model: Llama 4 Scout

Status: accepted

## Context
The bot must run on the Workers Free plan. Seven vision models in the Workers AI catalog were
compared on real screenshots using the bot's own prompt and schema ([evaluation](../evaluation.md)).

## Decision
Keep `@cf/meta/llama-4-scout-17b-16e-instruct` as `VISION_MODEL`.

## Consequences
- 1 wrong cell out of 147 in the evaluation, 26–53 s per image.
- Gemma 4 26B is an equal-accuracy fallback but was up to 141 s on the wide table.
- Revisit when new free vision models appear: run `npm run eval` with the model id as an argument.
