import type { ToolCall } from '../../providers/types.js';
import type { ContextBudget } from '../../context/budget.js';
import type { ContextHealth } from '../../context/health.js';
import type { AllowRule } from '../../security/permissions.js';
import type { ApprovalResult } from '../../tui/components/ApprovalPrompt.js';
import { addMessage } from '../../session/manager.js';
import { log } from '../../observability/logger.js';
import { evaluateToolCall } from '../security-gate.js';
import { runToolCall } from '../tool-executor.js';

interface ToolExecutionEmitter {
  toolResult(name: string, text: string, success: boolean): void;
}

interface ToolExecutionInput {
  sessionId: string;
  iteration: number;
  toolCalls: ToolCall[];
  budget: ContextBudget | null;
  health: ContextHealth;
  allowRules: AllowRule[];
  approvedAllRef: { current: boolean };
  requestApproval: (toolName: string, args: Record<string, unknown>) => Promise<ApprovalResult>;
  signal: AbortSignal | undefined;
  emit: ToolExecutionEmitter;
}

export async function executeIterationTools(input: ToolExecutionInput): Promise<{ aborted: boolean }> {
  const {
    sessionId, iteration, toolCalls, budget, health,
    allowRules, approvedAllRef, requestApproval, signal, emit,
  } = input;

  for (const tc of toolCalls) {
    if (signal?.aborted) return { aborted: true };
    const toolName = tc.function.name;
    const toolArgs = tc.function.arguments;

    const gate = await evaluateToolCall({
      toolName,
      args: toolArgs,
      allowRules,
      approvedAllForSession: approvedAllRef,
      requestApproval,
    });
    if (gate.kind === 'blocked') {
      addMessage(sessionId, 'tool', gate.reason, undefined, tc.id);
      emit.toolResult(toolName, gate.reason, false);
      continue;
    }
    if (gate.kind === 'denied') {
      const resultText = 'Operação negada pelo usuário.';
      addMessage(sessionId, 'tool', resultText, undefined, tc.id);
      emit.toolResult(toolName, resultText, false);
      continue;
    }

    const executed = await runToolCall({
      toolName,
      args: toolArgs,
      budget,
      health,
    });
    log.toolCall({
      sessionId,
      iteration,
      name: toolName,
      success: executed.success,
      durationMs: executed.durationMs,
    });
    if (executed.deterministicRetryApplied) {
      log.retry({ sessionId, iteration, kind: 'deterministic' });
    }

    addMessage(sessionId, 'tool', executed.resultText, undefined, tc.id);
    emit.toolResult(toolName, executed.resultText, executed.success);
  }

  return { aborted: false };
}
