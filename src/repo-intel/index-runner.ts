import { runIndex, type RunIndexOptions } from './indexer.js';
import { isIndexEmpty, getAllIndexMeta } from './storage.js';
import type { IndexProgress, IndexResult } from './types.js';

let activeRun: Promise<IndexResult> | null = null;
let activeController: AbortController | null = null;

export interface IndexRunnerOptions {
  force?: boolean;
  onProgress?: (p: IndexProgress) => void;
}

export function isIndexRunning(): boolean {
  return activeRun !== null;
}

export function abortRunningIndex(): boolean {
  if (!activeController) return false;
  activeController.abort();
  return true;
}

export async function runIndexCommand(opts: IndexRunnerOptions = {}): Promise<IndexResult> {
  if (activeRun) {
    return activeRun;
  }
  const controller = new AbortController();
  activeController = controller;
  const runOpts: RunIndexOptions = {
    force: opts.force,
    onProgress: opts.onProgress,
    signal: controller.signal,
  };
  activeRun = runIndex(runOpts).finally(() => {
    activeRun = null;
    activeController = null;
  });
  return activeRun;
}

export async function ensureInitialIndex(opts: IndexRunnerOptions = {}): Promise<IndexResult | null> {
  if (!isIndexEmpty()) return null;
  if (activeRun) return activeRun;
  return runIndexCommand(opts);
}

export function getIndexStatus(): {
  empty: boolean;
  running: boolean;
  meta: Record<string, string>;
} {
  return {
    empty: isIndexEmpty(),
    running: isIndexRunning(),
    meta: getAllIndexMeta(),
  };
}
