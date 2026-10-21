# 0003 – Reply with TSV in a copy block; files only on request

Status: accepted

## Context
The user wants to copy and paste into Excel, and does not want a file every time.
CSV pasted into Excel usually lands in one column. Tab-separated text splits into cells on paste.

## Decision
Reply with TSV inside a `<pre>` block (Telegram shows a copy control), add a `copy_text` button when
the table fits in 256 characters, and send `.csv`/`.tsv` files only via `/csv`, `/tsv` or a button.

## Consequences
- One-step paste for normal tables.
- Long tables arrive in several messages. Tabs surviving copy must be confirmed per client (plan, phase 3).
