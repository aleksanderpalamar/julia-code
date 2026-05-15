export interface CodeChunk {
  id: number;
  file_path: string;
  start_line: number;
  end_line: number;
  content: string;
  content_hash: string;
  file_hash: string;
  language: string | null;
  embedding: Uint8Array | null;
  embedding_model: string | null;
  token_estimate: number;
  indexed_at: string;
}

export interface PendingChunk {
  file_path: string;
  start_line: number;
  end_line: number;
  content: string;
  content_hash: string;
  file_hash: string;
  language: string | null;
  token_estimate: number;
}

export interface RankedChunk {
  chunk: CodeChunk;
  score: number;
  similarity: number;
}

export interface IndexProgress {
  phase: 'scanning' | 'chunking' | 'embedding' | 'cleanup' | 'done';
  filesTotal: number;
  filesProcessed: number;
  filesSkipped: number;
  chunksInserted: number;
  chunksEmbedded: number;
  chunksFailed: number;
  currentFile?: string;
}

export interface IndexResult {
  filesScanned: number;
  filesIndexed: number;
  filesSkipped: number;
  chunksTotal: number;
  chunksEmbedded: number;
  chunksFailed: number;
  durationMs: number;
  aborted: boolean;
  reason: 'completed' | 'signal' | 'provider-unavailable' | 'consecutive-failures' | 'not-a-repo';
}
