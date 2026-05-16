import type { SQLInputValue } from 'node:sqlite';
import { getDb } from '../session/db.js';
import type { CodeChunk, PendingChunk } from './types.js';

export function upsertChunk(chunk: PendingChunk): number {
  const db = getDb();
  db.prepare(
    `INSERT INTO code_chunks (
      file_path, start_line, end_line, content, content_hash, file_hash,
      language, token_estimate
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path, start_line, end_line) DO UPDATE SET
      content = excluded.content,
      content_hash = excluded.content_hash,
      file_hash = excluded.file_hash,
      language = excluded.language,
      token_estimate = excluded.token_estimate,
      embedding = CASE
        WHEN code_chunks.content_hash = excluded.content_hash THEN code_chunks.embedding
        ELSE NULL
      END,
      embedding_model = CASE
        WHEN code_chunks.content_hash = excluded.content_hash THEN code_chunks.embedding_model
        ELSE NULL
      END,
      indexed_at = datetime('now')`
  ).run(
    chunk.file_path,
    chunk.start_line,
    chunk.end_line,
    chunk.content,
    chunk.content_hash,
    chunk.file_hash,
    chunk.language,
    chunk.token_estimate,
  );
  const row = db.prepare(
    'SELECT id FROM code_chunks WHERE file_path = ? AND start_line = ? AND end_line = ?'
  ).get(chunk.file_path, chunk.start_line, chunk.end_line) as { id: number } | undefined;
  return row?.id ?? 0;
}

export function updateChunkEmbedding(id: number, embedding: Uint8Array, model: string): void {
  getDb().prepare(
    'UPDATE code_chunks SET embedding = ?, embedding_model = ? WHERE id = ?'
  ).run(embedding, model, id);
}

export function getChunksByFile(filePath: string): CodeChunk[] {
  return getDb().prepare(
    'SELECT * FROM code_chunks WHERE file_path = ? ORDER BY start_line'
  ).all(filePath) as unknown as CodeChunk[];
}

export function getFileHash(filePath: string): string | null {
  const row = getDb().prepare(
    'SELECT file_hash FROM code_chunks WHERE file_path = ? LIMIT 1'
  ).get(filePath) as { file_hash: string } | undefined;
  return row?.file_hash ?? null;
}

export function deleteChunksForFile(filePath: string): number {
  const result = getDb().prepare(
    'DELETE FROM code_chunks WHERE file_path = ?'
  ).run(filePath);
  return Number(result.changes ?? 0);
}

export function deleteObsoleteChunksForFile(filePath: string, keepRanges: Array<[number, number]>): number {
  const db = getDb();
  if (keepRanges.length === 0) {
    const result = db.prepare('DELETE FROM code_chunks WHERE file_path = ?').run(filePath);
    return Number(result.changes ?? 0);
  }
  // Resolve obsolete ids in JS, then delete by id in batches. A single
  // `NOT IN (VALUES ...)` statement uses 2 bind params per range and trips
  // SQLITE_MAX_VARIABLE_NUMBER on pathological files (~1M short lines).
  // Batching `NOT IN` directly would be wrong — a range kept in one batch
  // would be deleted by another's `NOT IN` — so we invert the comparison.
  const keep = new Set(keepRanges.map(([s, e]) => `${s}:${e}`));
  const rows = db.prepare(
    'SELECT id, start_line, end_line FROM code_chunks WHERE file_path = ?',
  ).all(filePath) as Array<{ id: number; start_line: number; end_line: number }>;
  const obsolete = rows
    .filter(r => !keep.has(`${r.start_line}:${r.end_line}`))
    .map(r => r.id);
  if (obsolete.length === 0) return 0;

  let removed = 0;
  const BATCH = 500;
  for (let i = 0; i < obsolete.length; i += BATCH) {
    const batch = obsolete.slice(i, i + BATCH);
    const placeholders = batch.map(() => '?').join(',');
    const result = db.prepare(
      `DELETE FROM code_chunks WHERE id IN (${placeholders})`,
    ).run(...(batch as SQLInputValue[]));
    removed += Number(result.changes ?? 0);
  }
  return removed;
}

export function deleteChunksNotIn(filePaths: string[]): number {
  if (filePaths.length === 0) {
    const result = getDb().prepare('DELETE FROM code_chunks').run();
    return Number(result.changes ?? 0);
  }
  const placeholders = filePaths.map(() => '?').join(',');
  const result = getDb().prepare(
    `DELETE FROM code_chunks WHERE file_path NOT IN (${placeholders})`
  ).run(...(filePaths as SQLInputValue[]));
  return Number(result.changes ?? 0);
}

export function getPendingChunks(limit = 50): CodeChunk[] {
  return getDb().prepare(
    'SELECT * FROM code_chunks WHERE embedding IS NULL ORDER BY id ASC LIMIT ?'
  ).all(limit) as unknown as CodeChunk[];
}

export function countPendingChunks(): number {
  const row = getDb().prepare(
    'SELECT COUNT(*) as count FROM code_chunks WHERE embedding IS NULL'
  ).get() as { count: number };
  return row.count;
}

export function countChunks(): number {
  const row = getDb().prepare(
    'SELECT COUNT(*) as count FROM code_chunks'
  ).get() as { count: number };
  return row.count;
}

export function getEmbeddedChunks(limit = 5000): CodeChunk[] {
  return getDb().prepare(
    'SELECT * FROM code_chunks WHERE embedding IS NOT NULL ORDER BY id ASC LIMIT ?'
  ).all(limit) as unknown as CodeChunk[];
}

export function getAllFilePaths(): string[] {
  const rows = getDb().prepare(
    'SELECT DISTINCT file_path FROM code_chunks ORDER BY file_path'
  ).all() as Array<{ file_path: string }>;
  return rows.map(r => r.file_path);
}

export function invalidateEmbeddingsNotMatchingModel(currentModel: string): number {
  const result = getDb().prepare(
    `UPDATE code_chunks
       SET embedding = NULL, embedding_model = NULL
       WHERE embedding_model IS NOT NULL AND embedding_model != ?`,
  ).run(currentModel);
  return Number(result.changes ?? 0);
}

export function isIndexEmpty(): boolean {
  return countChunks() === 0;
}

export function getIndexMeta(key: string): string | null {
  const row = getDb().prepare(
    'SELECT value FROM code_index_meta WHERE key = ?'
  ).get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setIndexMeta(key: string, value: string): void {
  getDb().prepare(
    `INSERT INTO code_index_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, value);
}

export function getAllIndexMeta(): Record<string, string> {
  const rows = getDb().prepare(
    'SELECT key, value FROM code_index_meta'
  ).all() as Array<{ key: string; value: string }>;
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}
