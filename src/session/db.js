"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.closeDb = closeDb;
var better_sqlite3_1 = require("better-sqlite3");
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var index_js_1 = require("../config/index.js");
var _db = null;
function getDb() {
    if (_db)
        return _db;
    var dbPath = (0, index_js_1.getConfig)().dbPath;
    var dbDir = (0, node_path_1.dirname)(dbPath);
    (0, node_fs_1.mkdirSync)(dbDir, { recursive: true, mode: 448 });
    _db = new better_sqlite3_1.default(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    try {
        (0, node_fs_1.chmodSync)(dbPath, 384);
    }
    catch (_a) {
    }
    initSchema(_db);
    return _db;
}
function initSchema(db) {
    db.exec("\n    CREATE TABLE IF NOT EXISTS sessions (\n      id TEXT PRIMARY KEY,\n      title TEXT NOT NULL DEFAULT 'New Session',\n      model TEXT NOT NULL,\n      created_at TEXT NOT NULL DEFAULT (datetime('now')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now'))\n    );\n\n    CREATE TABLE IF NOT EXISTS messages (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,\n      role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),\n      content TEXT NOT NULL,\n      tool_calls TEXT,       -- JSON array of tool calls (for assistant messages)\n      tool_call_id TEXT,     -- For tool result messages\n      created_at TEXT NOT NULL DEFAULT (datetime('now'))\n    );\n\n    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);\n\n    CREATE TABLE IF NOT EXISTS compactions (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,\n      summary TEXT NOT NULL,\n      messages_start INTEGER NOT NULL,\n      messages_end INTEGER NOT NULL,\n      created_at TEXT NOT NULL DEFAULT (datetime('now'))\n    );\n\n    CREATE TABLE IF NOT EXISTS memories (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      key TEXT NOT NULL UNIQUE,\n      content TEXT NOT NULL,\n      category TEXT NOT NULL DEFAULT 'general',\n      source_session_id TEXT,\n      created_at TEXT NOT NULL DEFAULT (datetime('now')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now'))\n    );\n    CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);\n    CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key);\n\n    CREATE TABLE IF NOT EXISTS orchestration_runs (\n      id TEXT PRIMARY KEY,\n      parent_session_id TEXT NOT NULL,\n      user_task TEXT NOT NULL,\n      subtask_count INTEGER NOT NULL DEFAULT 0,\n      status TEXT NOT NULL DEFAULT 'running',\n      created_at TEXT DEFAULT (datetime('now')),\n      completed_at TEXT,\n      duration_ms INTEGER,\n      FOREIGN KEY (parent_session_id) REFERENCES sessions(id)\n    );\n\n    CREATE TABLE IF NOT EXISTS subagent_runs (\n      id TEXT PRIMARY KEY,\n      run_id TEXT NOT NULL,\n      session_id TEXT NOT NULL,\n      task TEXT NOT NULL,\n      model TEXT,\n      status TEXT NOT NULL DEFAULT 'queued',\n      result TEXT,\n      error TEXT,\n      created_at TEXT DEFAULT (datetime('now')),\n      started_at TEXT,\n      completed_at TEXT,\n      duration_ms INTEGER,\n      FOREIGN KEY (run_id) REFERENCES orchestration_runs(id),\n      FOREIGN KEY (session_id) REFERENCES sessions(id)\n    );\n\n    CREATE INDEX IF NOT EXISTS idx_orchestration_runs_session ON orchestration_runs(parent_session_id);\n    CREATE INDEX IF NOT EXISTS idx_subagent_runs_run ON subagent_runs(run_id);\n  ");
    var columns = db.pragma('table_info(sessions)');
    if (!columns.some(function (c) { return c.name === 'total_tokens'; })) {
        db.exec('ALTER TABLE sessions ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0');
    }
    var msgCols = db.pragma('table_info(messages)');
    if (!msgCols.some(function (c) { return c.name === 'images'; })) {
        db.exec('ALTER TABLE messages ADD COLUMN images TEXT');
    }
    var compCols = db.pragma('table_info(compactions)');
    if (!compCols.some(function (c) { return c.name === 'format'; })) {
        db.exec("ALTER TABLE compactions ADD COLUMN format TEXT NOT NULL DEFAULT 'text'");
    }
}
function closeDb() {
    if (_db) {
        _db.close();
        _db = null;
    }
}
