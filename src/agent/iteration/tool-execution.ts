import type { ToolCall, ChatMessage, ChatChunk } from '../../providers/types.js';
import type { ContextBudget } from '../../context/budget.js';
import type { ContextHealth } from '../../context/health.js';
import type { AllowRule } from '../../security/permissions.js';
import type { QuotaGuard } from '../../security/rate-limit.js';
import type { ApprovalResult } from '../../tui/components/ApprovalPrompt.js';
import { addMessage } from '../../session/manager.js';
import { recordEvent } from '../../observability/logger.js';
import { getConfig } from '../../config/index.js';
import { getProvider } from '../../providers/registry.js';
import { evaluateToolCall } from '../security-gate.js';
import { runToolCall } from '../tool-executor.js';
import { runHook } from '../../hooks/runner.js';
import { getToolParameters, getToolSchema } from '../../tools/registry.js';
import { validateAndCoerceArgs, formatArgErrors, type ArgError } from '../../tools/validation.js';
import { attemptCorrection, type ChatStreamFn } from './tool-correction.js';
import { runDiagnostics } from '../diagnostics/runner.js';
import { getProjectDir } from '../../config/workspace.js';

/** Tools whose successful run mutates a file and should trigger diagnostics. */
const FILE_MUTATING_TOOLS = new Set(['write', 'edit']);

/** Consecutive correction failures within one iteration before the loop gives up. */
const CORRECTION_BREAKER_THRESHOLD = 3;

interface ToolExecutionEmitter {
  toolResult(name: string, text: string, success: boolean): void;
  chunk(text: string): void;
}

interface ToolExecutionInput {
  sessionId: string;
  turnId: string;
  iteration: number;
  toolCalls: ToolCall[];
  /** Conversation context — fed to the correction re-prompt on a bad call. */
  messages: ChatMessage[];
  /** Model used to correct malformed tool calls. */
  correctionModel: string;
  budget: ContextBudget | null;
  health: ContextHealth;
  allowRules: AllowRule[];
  approvedAllRef: { current: boolean };
  requestApproval: (toolName: string, args: Record<string, unknown>) => Promise<ApprovalResult>;
  quotas?: QuotaGuard;
  signal: AbortSignal | undefined;
  emit: ToolExecutionEmitter;
}

/** Tracks runaway correction within a single iteration (circuit breaker). */
interface CorrectionBreaker {
  consecutiveFailures: number;
  disabled: boolean;
}

export async function executeIterationTools(input: ToolExecutionInput): Promise<{ aborted: boolean }> {
  const {
    sessionId, turnId, iteration, toolCalls, messages, correctionModel, budget, health,
    allowRules, approvedAllRef, requestApproval, quotas, signal, emit,
  } = input;

  const breaker: CorrectionBreaker = { consecutiveFailures: 0, disabled: false };
  const changedFiles = new Set<string>();

  for (const tc of toolCalls) {
    if (signal?.aborted) return { aborted: true };
    const toolName = tc.function.name;

    // Strict schema validation before anything else runs: the hook, the
    // security gate and the tool all read the arguments, so they must see a
    // coerced, well-typed object. A malformed call goes through the correction
    // loop; if that fails, the schema errors are reported back to the model.
    const toolArgs = await resolveToolArgs({
      sessionId, turnId, iteration, toolCall: tc, messages, correctionModel, breaker, emit, signal,
    });
    // The correction loop above can await a full LLM request — re-check the
    // signal so a cancellation during it is honoured before the tool runs.
    if (signal?.aborted) return { aborted: true };
    if (toolArgs === null) {
      continue; // resolveToolArgs already recorded the failure as a tool result
    }

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
      recordEvent('gate_decision', { turnId, sessionId, iteration, toolName, outcome: 'blocked', via: 'hook' });
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
      quotas,
    });
    recordEvent('gate_decision', { turnId, sessionId, iteration, toolName, outcome: gate.kind, via: gate.via });

    if (gate.kind === 'blocked' || gate.kind === 'rate_limited') {
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
      sessionId,
      turnId,
    });
    recordEvent('tool_call', {
      turnId,
      sessionId,
      iteration,
      name: toolName,
      success: executed.success,
      durationMs: executed.durationMs,
    });
    if (executed.deterministicRetryApplied) {
      recordEvent('retry', { turnId, sessionId, iteration, kind: 'deterministic' });
    }

    addMessage(sessionId, 'tool', executed.resultText, undefined, tc.id);
    emit.toolResult(toolName, executed.resultText, executed.success);

    if (executed.success && FILE_MUTATING_TOOLS.has(toolName) && typeof toolArgs.path === 'string') {
      changedFiles.add(toolArgs.path);
    }

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

  await reportDiagnostics({ sessionId, turnId, iteration, changedFiles, signal, emit });

  return { aborted: false };
}

interface ReportDiagnosticsInput {
  sessionId: string;
  turnId: string;
  iteration: number;
  changedFiles: Set<string>;
  signal: AbortSignal | undefined;
  emit: ToolExecutionEmitter;
}

/**
 * Runs the configured project check once per iteration after any file edits and
 * feeds the resulting errors back to the model as a system message, so it can
 * self-correct on the next iteration. No-op when no command is configured or
 * nothing was edited — keeping the feature opt-in with zero default cost.
 */
async function reportDiagnostics(input: ReportDiagnosticsInput): Promise<void> {
  const { sessionId, turnId, iteration, changedFiles, signal, emit } = input;
  if (changedFiles.size === 0 || signal?.aborted) return;

  const config = getConfig();
  const command = config.diagnosticsCommand;
  if (!command) return;

  emit.chunk('🔎 Verificando diagnósticos...\n');
  const startedAt = Date.now();
  const outcome = await runDiagnostics({
    command,
    cwd: getProjectDir(),
    changedFiles: [...changedFiles],
    timeoutMs: config.diagnosticsTimeoutMs,
    signal,
  });
  if (signal?.aborted) return;

  recordEvent('diagnostics', { turnId, sessionId, iteration, ok: outcome.ok, durationMs: Date.now() - startedAt });

  if (!outcome.ok) {
    addMessage(sessionId, 'system', `[diagnostics]\n${outcome.report}`);
    emit.toolResult('diagnostics', outcome.report, false);
  }
}

interface ResolveArgsInput {
  sessionId: string;
  turnId: string;
  iteration: number;
  toolCall: ToolCall;
  messages: ChatMessage[];
  correctionModel: string;
  breaker: CorrectionBreaker;
  emit: ToolExecutionEmitter;
  signal: AbortSignal | undefined;
}

/**
 * Validates a tool call and, on failure, runs the correction loop. Returns the
 * arguments ready for execution, or null when the call could not be salvaged
 * (in which case the schema errors are already recorded as a tool result).
 */
async function resolveToolArgs(input: ResolveArgsInput): Promise<Record<string, unknown> | null> {
  const {
    sessionId, turnId, iteration, toolCall, messages, correctionModel, breaker, emit, signal,
  } = input;
  const toolName = toolCall.function.name;

  const validation = validateAndCoerceArgs(getToolParameters(toolName), toolCall.function.arguments);
  if (validation.ok) {
    breaker.consecutiveFailures = 0;
    return validation.value;
  }

  const corrected = await correctOrNull({
    sessionId, turnId, iteration, toolCall, errors: validation.errors,
    correctionModel, messages, breaker, emit, signal,
  });
  if (corrected) return corrected;

  const reason = formatArgErrors(toolName, validation.errors);
  addMessage(sessionId, 'tool', reason, undefined, toolCall.id);
  emit.toolResult(toolName, reason, false);
  return null;
}

interface CorrectOrNullInput {
  sessionId: string;
  turnId: string;
  iteration: number;
  toolCall: ToolCall;
  errors: ArgError[];
  correctionModel: string;
  messages: ChatMessage[];
  breaker: CorrectionBreaker;
  emit: ToolExecutionEmitter;
  signal: AbortSignal | undefined;
}

/** Runs the focused correction loop, honouring config and the circuit breaker. */
async function correctOrNull(input: CorrectOrNullInput): Promise<Record<string, unknown> | null> {
  const {
    sessionId, turnId, iteration, toolCall, errors, correctionModel, messages, breaker, emit, signal,
  } = input;
  const toolName = toolCall.function.name;

  const maxAttempts = getConfig().toolCorrectionAttempts;
  if (maxAttempts <= 0 || breaker.disabled) return null;

  const toolSchema = getToolSchema(toolName);
  if (!toolSchema) return null;

  emit.chunk('🔧 Corrigindo chamada de ferramenta...\n');

  const chat = observedChat({ turnId, sessionId, iteration, model: correctionModel });
  const outcome = await attemptCorrection({
    toolCall, errors, toolSchema, messages,
    model: correctionModel, maxAttempts, chat, signal,
  });

  if (outcome.kind === 'corrected') {
    breaker.consecutiveFailures = 0;
    recordEvent('retry', { turnId, sessionId, iteration, kind: 'tool-correction' });
    return outcome.args;
  }

  breaker.consecutiveFailures++;
  if (breaker.consecutiveFailures >= CORRECTION_BREAKER_THRESHOLD) {
    breaker.disabled = true;
  }
  return null;
}

function observedChat(ctx: {
  turnId: string;
  sessionId: string;
  iteration: number;
  model: string;
}): ChatStreamFn {
  return async function* observed(params): AsyncGenerator<ChatChunk> {
    const startedAt = Date.now();
    let promptTokens = 0;
    let completionTokens = 0;
    let toolCallCount = 0;

    try {
      for await (const chunk of getProvider('ollama').chat(params)) {
        if (chunk.type === 'tool_call') toolCallCount++;
        if (chunk.type === 'done' && chunk.usage) {
          promptTokens = chunk.usage.promptTokens;
          completionTokens = chunk.usage.completionTokens;
        }
        yield chunk;
      }
    } finally {
      recordEvent('llm_call', {
        turnId: ctx.turnId,
        sessionId: ctx.sessionId,
        iteration: ctx.iteration,
        model: ctx.model,
        pass: 'correction',
        durationMs: Date.now() - startedAt,
        promptTokens,
        completionTokens,
        toolCallCount,
      });
    }
  };
}
