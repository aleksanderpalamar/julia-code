import { getEmbeddingProvider, isEmbeddingProviderAvailable } from '../memory/embeddings/index.js';
import { decideCodeGating } from './gating.js';
import { retrieveRelevantChunks } from './retrieval.js';
import { buildRepoContextBlock } from './context-builder.js';
import { isIndexEmpty, getIndexMeta } from './storage.js';
import { currentGitHead } from './indexer.js';
import { getProjectDir } from '../config/workspace.js';

const DEFAULT_LIMIT = 5;
const DEFAULT_POOL = 2000;

let staleWarningEmitted = false;

export async function prepareRepoCodeContext(
  input: string | null,
  budgetTokens: number,
): Promise<string> {
  if (budgetTokens <= 0) return '';
  if (!input || !input.trim()) return '';

  const gate = decideCodeGating(input);
  if (gate.skip) return '';

  if (isIndexEmpty()) return '';

  const available = await isEmbeddingProviderAvailable();
  if (!available) return '';

  const provider = getEmbeddingProvider();
  const ranked = await retrieveRelevantChunks(input, {
    provider,
    limit: DEFAULT_LIMIT,
    candidatePoolSize: DEFAULT_POOL,
  });
  if (ranked.length === 0) return '';

  const block = buildRepoContextBlock(ranked, budgetTokens);
  if (!block) return '';

  const staleHint = maybeStaleHint();
  return staleHint ? block + '\n\n' + staleHint : block;
}

function maybeStaleHint(): string | null {
  if (staleWarningEmitted) return null;
  const indexedSha = getIndexMeta('git_head_sha');
  if (!indexedSha) return null;
  const currentSha = currentGitHead(getProjectDir());
  if (!currentSha || currentSha === indexedSha) return null;
  staleWarningEmitted = true;
  return `_(Code index built from commit ${indexedSha.slice(0, 12)}; HEAD is now ${currentSha.slice(0, 12)}. Run /index to refresh.)_`;
}

export function _resetStaleWarning(): void {
  staleWarningEmitted = false;
}
