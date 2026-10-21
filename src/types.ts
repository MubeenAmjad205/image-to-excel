export interface Env {
  AI: Ai;
  DB: D1Database;
  VISION_MODEL: string;
  /** Public base URL of this Worker, used for table viewer links. */
  PUBLIC_URL: string;
  ALLOWED_CHAT_IDS: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ANTHROPIC_API_KEY?: string;
}

export interface Table {
  title: string;
  headers: string[];
  rows: string[][];
}

export interface Extraction {
  tables: Table[];
  /** Cells the model could not read clearly, or other caveats. */
  notes: string;
}

/** JSON schema both engines are asked to fill. */
export const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    tables: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          headers: { type: "array", items: { type: "string" } },
          rows: { type: "array", items: { type: "array", items: { type: "string" } } },
        },
        required: ["title", "headers", "rows"],
        additionalProperties: false,
      },
    },
    notes: { type: "string" },
  },
  required: ["tables", "notes"],
  additionalProperties: false,
} as const;

export const EXTRACTION_PROMPT = `You transcribe tables from images into structured data.

Rules:
- Copy every cell exactly as written: same spelling, case, symbols, spaces inside values. Never correct, translate or reformat values.
- Codes are common (site ids, model numbers like "R8881 S9000(B8B)"). Look carefully at 0/O, 1/I/l, 8/B, 5/S.
- Keep the column order of the image. Every row must have exactly as many cells as there are headers.
- An empty cell becomes "". Never shift a value into a neighbouring column to fill a gap.
- Ignore spreadsheet chrome: filter arrows, sort icons, row numbers, column letters, filter counts above the header.
- Do not add, merge or split columns unless the user's instruction asks for it.
- If the image holds several separate tables, return each one. Give each a short title ("" if none is visible).
- If a cell is unreadable, write your best reading and mention it in notes as "row N, column X: unsure". Otherwise notes is "".
- If there is no table at all, return an empty tables list and explain in notes.

Return only the JSON object.`;
