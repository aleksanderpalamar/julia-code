import type { ToolCall } from '../../providers/types.js';
import type { ContextBudget } from '../../context/budget.js';
import type { ContextHealth } from '../../context/health.js';
import type { AllowRule } from '../../security/permissions.js';
import type { ApprovalResult } from '../../tui/components/ApprovalPrompt.js';
import { addMessage } from '../../session/manager.js';
import { log } from '../../observability/logger.js';
import { evaluateToolCall } from '../security-gate.js';
import { runToolCall } from '../tool-executor.js';
import { runHook } from '../../hooks/runner.js';
import { getToolParameters } from '../../tools/registry.js';
import { validateAndCoerceArgs, formatArgErrors } from '../../tools/validation.js';

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

    // Strict schema validation before anything else runs: the hook, the
    // security gate and the tool all read the arguments, so they must see a
    // coerced, well-typed object. A malformed call is reported back to the
    // model instead of crashing inside the tool.
    const validation = validateAndCoerceArgs(getToolParameters(toolName), tc.function.arguments);
    if (!validation.ok) {
      const reason = formatArgErrors(toolName, validation.errors);
      addMessage(sessionId, 'tool', reason, undefined, tc.id);
      emit.toolResult(toolName, reason, false);
      continue;
    }
    const toolArgs = validation.value;

    const preHook = await runHook(
      'PreToolUse',
      {
        session_id: sessionId,
        cwd: process.cwd(),
        hook_event_name: 'PreToolUse',
        tool_name: toolName,
        tool_input: toolArgs,
      },
      { matchKey: toolName },
    );
    if (preHook.decision === 'block') {
      const reason = preHook.reason ?? 'Blocked by PreToolUse hook';
      addMessage(sessionId, 'tool', reason, undefined, tc.id);
      emit.toolResult(toolName, reason, false);
      continue;
    }

    const wrappedRequestApproval = async (name: string, args: Record<string, unknown>) => {
      await runHook('Notification', {
        session_id: sessionId,
        cwd: process.cwd(),
        hook_event_name: 'Notification',
        message: `Julia needs approval to run tool: ${name}`,
      });
      return requestApproval(name, args);
    };
    const gate = await evaluateToolCall({
      toolName,
      args: toolArgs,
      allowRules,
      approvedAllForSession: approvedAllRef,
      requestApproval: wrappedRequestApproval,
      preApproved: preHook.decision === 'approve',
    });
    if (gate.kind === 'blocked') {
      addMessage(sessionId, 'tool', gate.reason, undefined, tc.id);
      emit.toolResult(toolName, gate.reason, false);
      continue;
    }
    if (gate.kind === 'denied') {
      const resultText = 'Operation denied by the user.';
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

    const postHook = await runHook(
      'PostToolUse',
      {
        session_id: sessionId,
        cwd: process.cwd(),
        hook_event_name: 'PostToolUse',
        tool_name: toolName,
        tool_input: toolArgs,
        tool_response: executed.resultText,
        tool_success: executed.success,
      },
      { matchKey: toolName },
    );
    if (postHook.decision === 'block' && postHook.reason) {
      addMessage(sessionId, 'system', `[PostToolUse hook] ${postHook.reason}`);
    }
  }

  return { aborted: false };
}
