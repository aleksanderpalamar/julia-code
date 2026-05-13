import { executeTool } from '../tools/registry.js';
import { type ContextBudget } from '../context/budget.js';
import { type ContextHealth } from '../context/health.js';
import { maybeDeterministicRetry } from './retry.js';
import { computeResultLimit } from './tool-execution/result-limiter.js';
import { processToolResult } from './tool-execution/result-processor.js';

interface ExecutedTool {
  toolName: string;
  success: boolean;
  resultText: string;
  durationMs: number;
  deterministicRetryApplied: boolean;
}

interface RunToolCallInput {
  toolName: string;
  args: Record<string, unknown>;
  budget: ContextBudget | null;
  health: ContextHealth;
}

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

  const rawText = result.success
    ? result.output
    : `Error: ${errorWithHint}\n${result.output}`;

  const maxChars = computeResultLimit(toolName, budget, health);
  const resultText = processToolResult(rawText, toolName, maxChars);

  return {
    toolName,
    success: result.success,
    resultText,
    durationMs,
    deterministicRetryApplied,
  };
}
