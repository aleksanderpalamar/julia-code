import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';
import { getConfig } from '../config/index.js';

export interface Session {
  id: string;
  title: string;
  model: string;
  total_tokens: number;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  session_id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: string | null;
  tool_call_id?: string | null;
  images?: string | null;
  created_at: string;
}

export function createSession(title?: string): Session {
  const db = getDb();
  const id = randomUUID();
  const model = getConfig().defaultModel;

  db.prepare(
    'INSERT INTO sessions (id, title, model) VALUES (?, ?, ?)'
  ).run(id, title ?? 'New Session', model);

  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session;
}

export function getSession(id: string): Session | undefined {
  return getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined;
}

export function listSessions(): Session[] {
  return getDb().prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all() as Session[];
}

export function updateSessionTitle(id: string, title: string): void {
  getDb().prepare(
    "UPDATE sessions SET title = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(title, id);
}

export function addSessionTokens(id: string, tokens: number): void {
  getDb().prepare(
    "UPDATE sessions SET total_tokens = total_tokens + ?, updated_at = datetime('now') WHERE id = ?"
  ).run(tokens, id);
}

export function addMessage(
  sessionId: string,
  role: Message['role'],
  content: string,
  toolCalls?: object[],
  toolCallId?: string,
  images?: string[]
): Message {
  const db = getDb();

  db.prepare(
    'INSERT INTO messages (session_id, role, content, tool_calls, tool_call_id, images) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    sessionId,
    role,
    content,
    toolCalls ? JSON.stringify(toolCalls) : null,
    toolCallId ?? null,
    images?.length ? JSON.stringify(images) : null
  );

  db.prepare(
    "UPDATE sessions SET updated_at = datetime('now') WHERE id = ?"
  ).run(sessionId);

  const lastId = db.prepare('SELECT last_insert_rowid() as id').get() as { id: number };
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(lastId.id) as Message;
}

export function getMessages(sessionId: string, afterId?: number): Message[] {
  const db = getDb();
  if (afterId) {
    return db.prepare(
      'SELECT * FROM messages WHERE session_id = ? AND id > ? ORDER BY id'
    ).all(sessionId, afterId) as Message[];
  }
  return db.prepare(
    'SELECT * FROM messages WHERE session_id = ? ORDER BY id'
  ).all(sessionId) as Message[];
}

export function getMessageCount(sessionId: string): number {
  const row = getDb().prepare(
    'SELECT COUNT(*) as count FROM messages WHERE session_id = ?'
  ).get(sessionId) as { count: number };
  return row.count;
}

// --- Compaction ---

export interface Compaction {
  id: number;
  session_id: string;
  summary: string;
  messages_start: number;
  messages_end: number;
  created_at: string;
}

// --- Memory ---

export interface Memory {
  id: number;
  key: string;
  content: string;
  category: string;
  source_session_id: string | null;
  created_at: string;
  updated_at: string;
}

export function saveMemory(key: string, content: string, category = 'general', sourceSessionId?: string): Memory {
  const db = getDb();
  db.prepare(
    `INSERT INTO memories (key, content, category, source_session_id)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       content = excluded.content,
       category = excluded.category,
       source_session_id = excluded.source_session_id,
       updated_at = datetime('now')`
  ).run(key, content, category, sourceSessionId ?? null);

  return db.prepare('SELECT * FROM memories WHERE key = ?').get(key) as Memory;
}

export function getMemory(key: string): Memory | undefined {
  return getDb().prepare('SELECT * FROM memories WHERE key = ?').get(key) as Memory | undefined;
}

export function searchMemories(query: string, category?: string, limit = 20): Memory[] {
  const db = getDb();
  const pattern = `%${query}%`;
  if (category) {
    return db.prepare(
      'SELECT * FROM memories WHERE category = ? AND (key LIKE ? OR content LIKE ?) ORDER BY updated_at DESC LIMIT ?'
    ).all(category, pattern, pattern, limit) as Memory[];
  }
  return db.prepare(
    'SELECT * FROM memories WHERE key LIKE ? OR content LIKE ? ORDER BY updated_at DESC LIMIT ?'
  ).all(pattern, pattern, limit) as Memory[];
}

export function listMemories(category?: string, limit = 20): Memory[] {
  const db = getDb();
  if (category) {
    return db.prepare(
      'SELECT * FROM memories WHERE category = ? ORDER BY updated_at DESC LIMIT ?'
    ).all(category, limit) as Memory[];
  }
  return db.prepare(
    'SELECT * FROM memories ORDER BY updated_at DESC LIMIT ?'
  ).all(limit) as Memory[];
}

export function deleteMemory(key: string): boolean {
  const result = getDb().prepare('DELETE FROM memories WHERE key = ?').run(key);
  return result.changes > 0;
}

export function getRecentMemories(limit = 15): Memory[] {
  return getDb().prepare(
    'SELECT * FROM memories ORDER BY updated_at DESC LIMIT ?'
  ).all(limit) as Memory[];
}

// --- Orchestration Runs ---

export interface OrchestrationRun {
  id: string;
  parent_session_id: string;
  user_task: string;
  subtask_count: number;
  status: string;
  created_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

export function createOrchestrationRun(id: string, parentSessionId: string, userTask: string, subtaskCount: number): OrchestrationRun {
  const db = getDb();
  db.prepare(
    'INSERT INTO orchestration_runs (id, parent_session_id, user_task, subtask_count) VALUES (?, ?, ?, ?)'
  ).run(id, parentSessionId, userTask, subtaskCount);
  return db.prepare('SELECT * FROM orchestration_runs WHERE id = ?').get(id) as OrchestrationRun;
}

export function completeOrchestrationRun(id: string, status: 'completed' | 'failed', durationMs: number): void {
  getDb().prepare(
    "UPDATE orchestration_runs SET status = ?, completed_at = datetime('now'), duration_ms = ? WHERE id = ?"
  ).run(status, durationMs, id);
}

export function getOrchestrationRun(id: string): OrchestrationRun | undefined {
  return getDb().prepare('SELECT * FROM orchestration_runs WHERE id = ?').get(id) as OrchestrationRun | undefined;
}

export function listOrchestrationRuns(parentSessionId: string): OrchestrationRun[] {
  return getDb().prepare(
    'SELECT * FROM orchestration_runs WHERE parent_session_id = ? ORDER BY created_at DESC'
  ).all(parentSessionId) as OrchestrationRun[];
}

// --- Subagent Runs ---

export interface SubagentRun {
  id: string;
  run_id: string;
  session_id: string;
  task: string;
  model: string | null;
  status: string;
  result: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
}

export function createSubagentRun(id: string, runId: string, sessionId: string, task: string, model?: string): SubagentRun {
  const db = getDb();
  db.prepare(
    'INSERT INTO subagent_runs (id, run_id, session_id, task, model) VALUES (?, ?, ?, ?, ?)'
  ).run(id, runId, sessionId, task, model ?? null);
  return db.prepare('SELECT * FROM subagent_runs WHERE id = ?').get(id) as SubagentRun;
}

export function updateSubagentRunStatus(
  id: string,
  status: string,
  extra?: { startedAt?: string; completedAt?: string; durationMs?: number; result?: string; error?: string }
): void {
  const db = getDb();
  const sets = ['status = ?'];
  const params: unknown[] = [status];

  if (extra?.startedAt) { sets.push('started_at = ?'); params.push(extra.startedAt); }
  if (extra?.completedAt) { sets.push('completed_at = ?'); params.push(extra.completedAt); }
  if (extra?.durationMs !== undefined) { sets.push('duration_ms = ?'); params.push(extra.durationMs); }
  if (extra?.result !== undefined) { sets.push('result = ?'); params.push(extra.result); }
  if (extra?.error !== undefined) { sets.push('error = ?'); params.push(extra.error); }

  params.push(id);
  db.prepare(`UPDATE subagent_runs SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

export function getSubagentRun(id: string): SubagentRun | undefined {
  return getDb().prepare('SELECT * FROM subagent_runs WHERE id = ?').get(id) as SubagentRun | undefined;
}

export function listSubagentRuns(runId: string): SubagentRun[] {
  return getDb().prepare(
    'SELECT * FROM subagent_runs WHERE run_id = ? ORDER BY created_at'
  ).all(runId) as SubagentRun[];
}

// --- Compaction ---

export function getLatestCompaction(sessionId: string): Compaction | undefined {
  return getDb().prepare(
    'SELECT * FROM compactions WHERE session_id = ? ORDER BY id DESC LIMIT 1'
  ).get(sessionId) as Compaction | undefined;
}

export function saveCompaction(sessionId: string, summary: string, messagesStart: number, messagesEnd: number): Compaction {
  const db = getDb();
  db.prepare(
    'INSERT INTO compactions (session_id, summary, messages_start, messages_end) VALUES (?, ?, ?, ?)'
  ).run(sessionId, summary, messagesStart, messagesEnd);

  const lastId = db.prepare('SELECT last_insert_rowid() as id').get() as { id: number };
  return db.prepare('SELECT * FROM compactions WHERE id = ?').get(lastId.id) as Compaction;
}
