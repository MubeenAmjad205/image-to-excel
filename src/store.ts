import type { Env, Extraction } from "./types.ts";

export interface StoredTable {
  id: number;
  file_id: string;
  mime: string;
  engine: string;
  extraction: Extraction;
}

const now = () => Date.now();

export class Store {
  private db: D1Database;
  constructor(db: D1Database) {
    this.db = db;
  }

  /** Returns false if this update was already handled (Telegram retry). */
  async claimUpdate(updateId: number): Promise<boolean> {
    const r = await this.db
      .prepare("INSERT OR IGNORE INTO updates (update_id, created_at) VALUES (?, ?)")
      .bind(updateId, now())
      .run();
    return (r.meta.changes ?? 0) > 0;
  }

  async saveExtraction(chatId: number, fileId: string, mime: string, engine: string, e: Extraction): Promise<number> {
    const r = await this.db
      .prepare("INSERT INTO tables (chat_id, file_id, mime, data, engine, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id")
      .bind(chatId, fileId, mime, JSON.stringify(e), engine, now())
      .first<{ id: number }>();
    return r!.id;
  }

  /** By id, or the latest one. `withImage` skips tables that came from chat answers (no source image). */
  async getExtraction(chatId: number, id?: number, withImage = false): Promise<StoredTable | null> {
    const row = id
      ? await this.db.prepare("SELECT * FROM tables WHERE chat_id = ? AND id = ?").bind(chatId, id).first<Row>()
      : await this.db
          .prepare(`SELECT * FROM tables WHERE chat_id = ? ${withImage ? "AND file_id != ''" : ""} ORDER BY id DESC LIMIT 1`)
          .bind(chatId)
          .first<Row>();
    return row ? fromRow(row) : null;
  }

  /** Create an unguessable viewer token for a stored table. */
  async createShare(chatId: number, tableId: number): Promise<string> {
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await this.db
      .prepare("INSERT INTO shares (token, table_id, chat_id, created_at) VALUES (?, ?, ?, ?)")
      .bind(token, tableId, chatId, now())
      .run();
    return token;
  }

  async getShared(token: string): Promise<StoredTable | null> {
    const row = await this.db
      .prepare("SELECT t.* FROM shares s JOIN tables t ON t.id = s.table_id WHERE s.token = ?")
      .bind(token)
      .first<Row>();
    return row ? fromRow(row) : null;
  }

  async recentExtractions(chatId: number, limit = 3): Promise<StoredTable[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM tables WHERE chat_id = ? ORDER BY id DESC LIMIT ?")
      .bind(chatId, limit)
      .all<Row>();
    return results.map(fromRow).reverse();
  }

  async logEvent(e: { updateId?: number; kind: string; colo?: string; ms: number; error?: string }) {
    await this.db
      .prepare("INSERT INTO events (update_id, kind, colo, ms, error, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(e.updateId ?? null, e.kind, e.colo ?? null, e.ms, e.error?.slice(0, 500) ?? null, now())
      .run()
      .catch((err) => console.error("logEvent failed", err));
  }

  async addMessage(chatId: number, role: "user" | "assistant", content: string) {
    await this.db
      .prepare("INSERT INTO messages (chat_id, role, content, created_at) VALUES (?, ?, ?, ?)")
      .bind(chatId, role, content, now())
      .run();
  }

  async history(chatId: number, limit = 12): Promise<{ role: "user" | "assistant"; content: string }[]> {
    const { results } = await this.db
      .prepare("SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?")
      .bind(chatId, limit)
      .all<{ role: "user" | "assistant"; content: string }>();
    return results.reverse();
  }

  async clear(chatId: number) {
    await this.db.batch([
      this.db.prepare("DELETE FROM messages WHERE chat_id = ?").bind(chatId),
      this.db.prepare("DELETE FROM tables WHERE chat_id = ?").bind(chatId),
    ]);
  }
}

interface Row {
  id: number;
  file_id: string;
  mime: string;
  engine: string;
  data: string;
}

function fromRow(r: Row): StoredTable {
  return { id: r.id, file_id: r.file_id, mime: r.mime, engine: r.engine, extraction: JSON.parse(r.data) };
}

export type { Env };
