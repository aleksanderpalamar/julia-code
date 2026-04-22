import { getCompactableMessages, getEmergencyCompactableMessages } from './context.js';
import { getLatestCompaction, saveCompaction } from '../session/manager.js';
import {
  performStructuredCompaction,
  serializeCompaction,
  deserializeCompaction,
  formatCompactionForContext,
  type StructuredCompaction,
} from '../context/compaction.js';

export async function maybeCompact(sessionId: string, model: string): Promise<boolean> {
  const compactable = await getCompactableMessages(sessionId, model);
  if (!compactable) return false;

  try {
    const existingCompaction = getLatestCompaction(sessionId);

    let existingStructured: StructuredCompaction | null = null;
    if (existingCompaction) {
      existingStructured = deserializeCompaction(
        existingCompaction.summary,
        existingCompaction.format,
      );
    }

    const structured = await performStructuredCompaction(
      compactable.messages,
      existingStructured,
      model,
    );

    const summary = serializeCompaction(structured);
    if (summary) {
      const startId = existingCompaction?.messages_end ?? 0;
      saveCompaction(sessionId, summary, startId, compactable.lastId, 'structured');
    }
  } catch {
  }

  return true;
}

export async function performEmergencyCompaction(
  sessionId: string,
  model: string,
  keepCount: number,
): Promise<void> {
  const compactable = await getEmergencyCompactableMessages(sessionId, model, keepCount);
  if (!compactable) return;

  try {
    const existingCompaction = getLatestCompaction(sessionId);

    let existingStructured: StructuredCompaction | null = null;
    if (existingCompaction) {
      existingStructured = deserializeCompaction(
        existingCompaction.summary,
        existingCompaction.format,
      );
    }

    const structured = await performStructuredCompaction(
      compactable.messages,
      existingStructured,
      model,
    );

    const summary = serializeCompaction(structured);
    if (summary) {
      const startId = existingCompaction?.messages_end ?? 0;
      saveCompaction(sessionId, summary, startId, compactable.lastId, 'structured');
    }
  } catch {
  }
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
