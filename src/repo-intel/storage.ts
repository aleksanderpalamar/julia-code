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
  const pairExpr = keepRanges.map(() => '(? , ?)').join(',');
  const params: SQLInputValue[] = [filePath];
  for (const [s, e] of keepRanges) {
    params.push(s, e);
  }
  const result = db.prepare(
    `DELETE FROM code_chunks
     WHERE file_path = ?
       AND (start_line, end_line) NOT IN (VALUES ${pairExpr})`,
  ).run(...params);
  return Number(result.changes ?? 0);
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
