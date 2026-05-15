import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { getProjectDir } from '../config/workspace.js';
import { getEmbeddingProvider } from '../memory/embeddings/index.js';
import { chunkContent } from './chunker.js';
import { listIndexableFiles, languageFromPath, readFileSafe } from './file-scanner.js';
import {
  upsertChunk,
  deleteChunksForFile,
  deleteChunksNotIn,
  getFileHash,
  setIndexMeta,
  countChunks,
} from './storage.js';
import { embedPendingBatch } from './embed-writer.js';
import type { IndexProgress, IndexResult } from './types.js';

export interface RunIndexOptions {
  force?: boolean;
  signal?: AbortSignal;
  onProgress?: (p: IndexProgress) => void;
  maxFiles?: number;
  maxBytes?: number;
}

export async function runIndex(opts: RunIndexOptions = {}): Promise<IndexResult> {
  const started = Date.now();
  const projectDir = getProjectDir();

  setIndexMeta('last_index_started_at', new Date().toISOString());

  const progress: IndexProgress = {
    phase: 'scanning',
    filesTotal: 0,
    filesProcessed: 0,
    filesSkipped: 0,
    chunksInserted: 0,
    chunksEmbedded: 0,
    chunksFailed: 0,
  };
  opts.onProgress?.(progress);

  const scan = listIndexableFiles({ maxFiles: opts.maxFiles, maxBytes: opts.maxBytes });
  if (!scan.isGitRepo) {
    return {
      filesScanned: 0,
      filesIndexed: 0,
      filesSkipped: 0,
      chunksTotal: 0,
      chunksEmbedded: 0,
      chunksFailed: 0,
      durationMs: Date.now() - started,
      aborted: true,
      reason: 'not-a-repo',
    };
  }

  progress.phase = 'chunking';
  progress.filesTotal = scan.files.length;
  progress.filesSkipped = scan.skippedBinary + scan.skippedLarge + scan.skippedOverCap;
  opts.onProgress?.(progress);

  let filesIndexed = 0;
  for (const rel of scan.files) {
    if (opts.signal?.aborted) break;

    progress.currentFile = rel;
    progress.filesProcessed++;
    opts.onProgress?.(progress);

    const abs = join(projectDir, rel);
    const content = readFileSafe(abs);
    if (content == null) continue;

    const fileHash = sha256(content);
    if (!opts.force) {
      const existing = getFileHash(rel);
      if (existing === fileHash) continue;
    }

    deleteChunksForFile(rel);
    const language = languageFromPath(rel);
    const chunks = chunkContent(content);

    for (const c of chunks) {
      upsertChunk({
        file_path: rel,
        start_line: c.startLine,
        end_line: c.endLine,
        content: c.content,
        content_hash: sha256(c.content),
        file_hash: fileHash,
        language,
        token_estimate: c.tokenEstimate,
      });
      progress.chunksInserted++;
    }
    filesIndexed++;
  }

  progress.phase = 'cleanup';
  opts.onProgress?.(progress);

  const removed = deleteChunksNotIn(scan.files);
  if (removed > 0) {
    process.stderr.write(`[repo-intel] removed ${removed} chunks for deleted files\n`);
  }

  progress.phase = 'embedding';
  opts.onProgress?.(progress);

  const embedResult = await embedPendingBatch({
    signal: opts.signal,
    onProgress: (embedded) => {
      progress.chunksEmbedded = embedded;
      opts.onProgress?.(progress);
    },
  });
  progress.chunksEmbedded = embedResult.embedded;
  progress.chunksFailed = embedResult.failed;

  progress.phase = 'done';
  opts.onProgress?.(progress);

  setIndexMeta('last_index_completed_at', new Date().toISOString());
  setIndexMeta('embedding_model_used', getEmbeddingModelLabel(embedResult));
  setIndexMeta('total_chunks', String(countChunks()));
  const head = currentGitHead(projectDir);
  if (head) setIndexMeta('git_head_sha', head);

  const reason: IndexResult['reason'] = opts.signal?.aborted
    ? 'signal'
    : embedResult.reason === 'provider-unavailable'
      ? 'provider-unavailable'
      : embedResult.reason === 'consecutive-failures'
        ? 'consecutive-failures'
        : 'completed';

  return {
    filesScanned: scan.files.length,
    filesIndexed,
    filesSkipped: progress.filesSkipped,
    chunksTotal: progress.chunksInserted,
    chunksEmbedded: embedResult.embedded,
    chunksFailed: embedResult.failed,
    durationMs: Date.now() - started,
    aborted: reason !== 'completed',
    reason,
  };
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function getEmbeddingModelLabel(result: { embedded: number }): string {
  if (result.embedded === 0) return 'unknown';
  try {
    return getEmbeddingProvider().model;
  } catch {
    return 'unknown';
  }
}

export function currentGitHead(projectDir: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}
