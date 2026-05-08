import { sanitizeToolResult } from '../../security/sanitize.js';
import { wrapToolResult } from '../../security/boundaries.js';

const TRUNCATION_SUFFIX = '\n... [truncated — use offset/limit for large files]';

export function processToolResult(
  text: string,
  toolName: string,
  maxChars: number,
): string {
  let processed = text;
  if (processed.length > maxChars) {
    processed = processed.slice(0, maxChars) + TRUNCATION_SUFFIX;
  }
  processed = sanitizeToolResult(processed);
  processed = wrapToolResult(toolName, processed);
  return processed;
}
