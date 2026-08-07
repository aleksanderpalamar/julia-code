import { getCompactableMessages, getEmergencyCompactableMessages } from './context.js';
import { getLatestCompaction, saveCompaction, type Message } from '../session/manager.js';
import { estimateDbMessageTokens, estimateTokens } from '../context/token-counter.js';
import {
  performStructuredCompaction,
  serializeCompaction,
  deserializeCompaction,
  formatCompactionForContext,
  type StructuredCompaction,
} from '../context/compaction.js';

export interface CompactionOutcome {
  performed: boolean;
  messagesCompacted: number;
  tokensBefore: number;
  tokensAfter: number;
  durationMs: number;
}

const NO_COMPACTION: CompactionOutcome = {
  performed: false,
  messagesCompacted: 0,
  tokensBefore: 0,
  tokensAfter: 0,
  durationMs: 0,
};

export async function maybeCompact(
  sessionId: string,
  model: string,
  beforeCompact?: () => Promise<boolean>,
): Promise<CompactionOutcome> {
  const compactable = await getCompactableMessages(sessionId, model);
  if (!compactable) return NO_COMPACTION;

  if (beforeCompact && !(await beforeCompact())) return NO_COMPACTION;

  return await summarizeInto(sessionId, model, compactable.messages, compactable.lastId);
}

export async function performEmergencyCompaction(
  sessionId: string,
  model: string,
  keepCount: number,
): Promise<CompactionOutcome> {
  const compactable = await getEmergencyCompactableMessages(sessionId, model, keepCount);
  if (!compactable) return NO_COMPACTION;

  return await summarizeInto(sessionId, model, compactable.messages, compactable.lastId);
}

async function summarizeInto(
  sessionId: string,
  model: string,
  messages: Message[],
  lastId: number,
): Promise<CompactionOutcome> {
  const startedAt = Date.now();
  const tokensBefore = messages.reduce(
    (sum, m) => sum + estimateDbMessageTokens(m.content, m.tool_calls),
    0,
  );
  let tokensAfter = 0;

  try {
    const existingCompaction = getLatestCompaction(sessionId);

    let existingStructured: StructuredCompaction | null = null;
    if (existingCompaction) {
      existingStructured = deserializeCompaction(
        existingCompaction.summary,
        existingCompaction.format,
      );
    }

    const structured = await performStructuredCompaction(messages, existingStructured, model);

    const summary = serializeCompaction(structured);
    if (summary) {
      const startId = existingCompaction?.messages_end ?? 0;
      saveCompaction(sessionId, summary, startId, lastId, 'structured');
      tokensAfter = estimateTokens(summary);
    }
  } catch {
  }

  return {
    performed: true,
    messagesCompacted: messages.length,
    tokensBefore,
    tokensAfter,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Build a read-only snapshot of the parent session's structured compaction
 * for subagents. Capped at ~500 tokens via formatCompactionForContext, with
 * file lists trimmed to the 10 most recent entries.
 */
export function buildSharedContextSnapshot(sessionId: string): string | undefined {
  const row = getLatestCompaction(sessionId);
  if (!row) return undefined;

  const compaction = deserializeCompaction(row.summary, row.format);

  const trimmed: StructuredCompaction = {
    ...compaction,
    filesRead: compaction.filesRead.slice(-10),
    filesModified: compaction.filesModified.slice(-10),
  };

  const formatted = formatCompactionForContext(trimmed, 500);
  return formatted.trim() || undefined;
}
