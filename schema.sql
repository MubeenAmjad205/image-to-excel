-- Telegram update ids already handled, so webhook retries are ignored.
CREATE TABLE IF NOT EXISTS updates (
  update_id INTEGER PRIMARY KEY,
  created_at INTEGER NOT NULL
);

-- Every extracted table, plus the Telegram file id of its source image (for /hq re-runs).
CREATE TABLE IF NOT EXISTS tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  file_id TEXT NOT NULL,
  mime TEXT NOT NULL,
  data TEXT NOT NULL,
  engine TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tables_chat ON tables (chat_id, id);

-- Chat history for questions about the data.
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_chat ON messages (chat_id, id);

-- Unguessable links to the table viewer page (/t/<token>). One row per extraction.
CREATE TABLE IF NOT EXISTS shares (
  token TEXT PRIMARY KEY,
  table_id INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
