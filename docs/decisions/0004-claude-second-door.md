# 0004 – Claude as an optional second engine

Status: accepted

## Context
Free models may misread dense or blurry tables. The owner wants to stay free by default but keep a
better option available.

## Decision
`/hq` and the "Re-read HQ" button re-run extraction with Claude (`claude-opus-5-5`) through the
official SDK. It is active only when `ANTHROPIC_API_KEY` is set. Server-side refusal fallback is on.

## Consequences
- Normal use costs nothing. HQ reads cost a few cents each.
- The bot must keep working with no key; all Claude paths check for it first.
