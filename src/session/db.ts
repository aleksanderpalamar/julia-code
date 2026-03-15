import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getConfig } from '../config/index.js';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = getConfig().dbPath;
  mkdirSync(dirname(dbPath), { recursive: true });

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Session',
      model TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),
      content TEXT NOT NULL,
      tool_calls TEXT,       -- JSON array of tool calls (for assistant messages)
      tool_call_id TEXT,     -- For tool result messages
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);

    CREATE TABLE IF NOT EXISTS compactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      messages_start INTEGER NOT NULL,
      messages_end INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      source_session_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
    CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key);

    CREATE TABLE IF NOT EXISTS orchestration_runs (
      id TEXT PRIMARY KEY,
      parent_session_id TEXT NOT NULL,
      user_task TEXT NOT NULL,
      subtask_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running',
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      duration_ms INTEGER,
      FOREIGN KEY (parent_session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS subagent_runs (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      task TEXT NOT NULL,
      model TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      result TEXT,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT,
      duration_ms INTEGER,
      FOREIGN KEY (run_id) REFERENCES orchestration_runs(id),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_orchestration_runs_session ON orchestration_runs(parent_session_id);
    CREATE INDEX IF NOT EXISTS idx_subagent_runs_run ON subagent_runs(run_id);
  `);

  // Migration: add total_tokens column to sessions if it doesn't exist
  const columns = db.pragma('table_info(sessions)') as Array<{ name: string }>;
  if (!columns.some(c => c.name === 'total_tokens')) {
    db.exec('ALTER TABLE sessions ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0');
  }
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
