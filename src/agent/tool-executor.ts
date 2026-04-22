import { executeTool } from '../tools/registry.js';
import { computeToolResultCap, type ContextBudget } from '../context/budget.js';
import { getToolResultCapFactor, type ContextHealth } from '../context/health.js';
import { sanitizeToolResult } from '../security/sanitize.js';
import { wrapToolResult } from '../security/boundaries.js';
import { maybeDeterministicRetry } from './retry.js';

export interface ExecutedTool {
  toolName: string;
  success: boolean;
  resultText: string;
  durationMs: number;
  /** True when a deterministic retry hint was appended to the error message. */
  deterministicRetryApplied: boolean;
}

export interface RunToolCallInput {
  toolName: string;
  args: Record<string, unknown>;
  budget: ContextBudget | null;
  health: ContextHealth;
}

const DEFAULT_MAX_RESULT_CHARS = 12000;
const TRUNCATION_SUFFIX = '\n... [truncated — use offset/limit for large files]';

/**
 * Run a single tool call end-to-end: execute, apply deterministic retry hint
 * on failure, truncate result text to the budget × health factor cap, then
 * sanitize and wrap for boundary safety. Returns everything the caller needs
 * to persist the tool message and emit `tool_result`.
 */
export async function runToolCall(input: RunToolCallInput): Promise<ExecutedTool> {
  const { toolName, args, budget, health } = input;

  const start = Date.now();
  const result = await executeTool(toolName, args);
  const durationMs = Date.now() - start;

  let errorWithHint = result.error;
  let deterministicRetryApplied = false;
  if (!result.success && result.error) {
    const retry = await maybeDeterministicRetry(result.error, args);
    if (retry) {
      errorWithHint = result.error + retry.hint;
      deterministicRetryApplied = true;
    }
  }

  let resultText = result.success
    ? result.output
    : `Error: ${errorWithHint}\n${result.output}`;

  let maxResultChars = DEFAULT_MAX_RESULT_CHARS;
  if (budget) {
    maxResultChars = computeToolResultCap(budget, toolName);
    const capFactor = getToolResultCapFactor(health);
    maxResultChars = Math.floor(maxResultChars * capFactor);
  }
  if (resultText.length > maxResultChars) {
    resultText = resultText.slice(0, maxResultChars) + TRUNCATION_SUFFIX;
  }

  resultText = sanitizeToolResult(resultText);
  resultText = wrapToolResult(toolName, resultText);

  return {
    toolName,
    success: result.success,
    resultText,
    durationMs,
    deterministicRetryApplied,
  };
}
