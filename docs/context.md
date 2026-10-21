# Context

## Problem

Field and project teams share status sheets as screenshots in chat (site trackers, equipment
lists, installation status). Re-typing them into Excel is slow and error-prone. The goal is a
Telegram bot that turns a screenshot into data you can paste into a spreadsheet in one step,
and lets you ask questions about it.

## Users

One owner and a few teammates, on phones and desktop Telegram. Not a public product.
Usage is tens of images a day, not thousands.

## Typical input

Screenshots of Excel tables, usually clean, sometimes with:

- Coloured rows that carry status (green = done, orange = waiting).
- Filter arrows, sort icons and filter counts above the header row.
- Empty cells in the middle of a row.
- Codes where one wrong character matters: site ids (`SITE166`, `ABCD80`),
  equipment models (`R8881 S9000(B8B)`, `1*R8852E S9000+2*R9614E S26+`), board positions (`51.1.1`).
- Composite cells joined with `+` that users sometimes want split into columns.

Real sample images contain names and operator site data. Keep them out of the public repo.
Put local samples in `samples/`, which is git-ignored.

## What "good" means

1. Every cell is copied exactly. A wrong site id is worse than a missing one.
2. Empty cells stay empty and in the right column.
3. Paste works in one action: copy, click A1, paste.
4. Files appear only when the user asks.
5. Runs on Cloudflare's free tier.

## Out of scope for now

- Handwriting, rotated photos of paper, multi-page PDFs.
- Writing directly into Google Sheets or OneDrive.
- Multi-tenant use, billing, user accounts.
