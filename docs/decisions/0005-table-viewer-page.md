# 0005 – Table viewer page for copying

Status: accepted (supersedes the TSV-in-chat part of 0003)

## Context
First real test, 2026-10-21: the extracted data was mostly right, but the TSV reply looked like one
run-on block in Telegram Desktop because tabs render as spaces. Copying from it did not reliably
split into columns. The CSV file, opened in Numbers, was perfect.

## Decision
Reply with a short summary and an **Open & copy** button. The button opens a page served by the
Worker at `/t/<random token>` (Mini App in private chats, link in groups). The page shows a proper
grid and its **Copy table** button puts HTML and TSV on the clipboard together.

## Consequences
- Paste into Excel, Sheets or Numbers gives real cells. Excel keeps codes as text.
- One extra tap compared with copying from the chat.
- Anyone with a viewer link can see that table. Tokens are long and random, pages are `noindex`
  and `no-store`. Add expiry if links start being forwarded (plan, phase 4).
