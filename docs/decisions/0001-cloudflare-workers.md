# 0001 – Host on Cloudflare Workers

Status: accepted

## Context
The bot needs an always-on HTTPS endpoint for Telegram, cheap storage for history, and an image model.
The owner wants it free.

## Decision
Run as a single Cloudflare Worker using the webhook mode of the Bot API, with D1 for storage and
Workers AI for models.

## Consequences
- Free tier covers expected traffic. No server to maintain.
- No long polling; the webhook must be registered and protected with a secret.
- Free plan limits: small CPU time per request (model waits do not count), bundle size cap,
  daily Workers AI allocation. Code must avoid Node-only APIs and heavy dependencies.
