import type { SlashCommand } from "./types.js";
import {
  runIndexCommand,
  isIndexRunning,
  getIndexStatus,
  abortRunningIndex,
} from "../../../repo-intel/index-runner.js";
import { invalidateFilePathsCache } from "../../../repo-intel/file-paths.js";
import type { IndexProgress } from "../../../repo-intel/types.js";

const PROGRESS_INTERVAL_MS = 2_000;

export const indexCmd: SlashCommand = {
  match: (t) => t === "/index" || t === "/index force" || t === "/index status" || t === "/index abort",
  handle: async (text, ctx) => {
    if (text === "/index status") {
      const status = getIndexStatus();
      const lines: string[] = [];
      if (status.empty) {
        lines.push("Code index: empty (run /index to build).");
      } else {
        lines.push(`Code index: ${status.meta.total_chunks ?? '?'} chunks`);
        if (status.meta.last_index_completed_at) {
          lines.push(`  Last indexed: ${status.meta.last_index_completed_at}`);
        }
        if (status.meta.embedding_model_used) {
          lines.push(`  Model: ${status.meta.embedding_model_used}`);
        }
        if (status.meta.git_head_sha) {
          lines.push(`  Git HEAD: ${status.meta.git_head_sha.slice(0, 12)}`);
        }
      }
      if (status.running) {
        lines.push("  (index currently running)");
      }
      ctx.addSystemEntry(lines.join("\n"));
      return true;
    }

    if (text === "/index abort") {
      const aborted = abortRunningIndex();
      ctx.addSystemEntry(
        aborted
          ? "Aborting code index..."
          : "No index running.",
      );
      return true;
    }

    if (isIndexRunning()) {
      ctx.addSystemEntry("Index already in progress. Use /index abort to cancel, /index status to check.");
      return true;
    }

    const force = text === "/index force";
    ctx.addSystemEntry(
      force
        ? "Starting full code index rebuild..."
        : "Starting code index (incremental)...",
    );

    let lastReport = 0;
    const onProgress = (p: IndexProgress) => {
      const now = Date.now();
      if (now - lastReport < PROGRESS_INTERVAL_MS) return;
      lastReport = now;
      if (p.phase === 'chunking') {
        ctx.addSystemEntry(`  Chunking: ${p.filesProcessed}/${p.filesTotal} files (${p.chunksInserted} chunks so far)`);
      } else if (p.phase === 'embedding') {
        ctx.addSystemEntry(`  Embedding: ${p.chunksEmbedded} chunks`);
      }
    };

    try {
      const result = await runIndexCommand({ force, onProgress });
      invalidateFilePathsCache();
      if (result.reason === 'not-a-repo') {
        ctx.addSystemEntry("Not a git repository — code index skipped. Run `git init` and try again.");
        return true;
      }
      if (result.reason === 'provider-unavailable') {
        ctx.addSystemEntry(
          `Indexed ${result.filesIndexed} files (${result.chunksTotal} chunks) but Ollama is unavailable — embeddings skipped. Run /index again when Ollama is up.`,
        );
        return true;
      }
      const secs = (result.durationMs / 1000).toFixed(1);
      const skip = result.filesSkipped > 0 ? ` (${result.filesSkipped} skipped)` : "";
      const failed = result.chunksFailed > 0 ? ` ${result.chunksFailed} failed.` : "";
      ctx.addSystemEntry(
        `Indexed ${result.filesIndexed} files into ${result.chunksTotal} chunks${skip}. ${result.chunksEmbedded} embedded in ${secs}s.${failed}`,
      );
    } catch (err) {
      ctx.addSystemEntry(
        `Index failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return true;
  },
};
