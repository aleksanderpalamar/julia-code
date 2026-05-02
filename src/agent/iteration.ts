import type { ToolCall, TokenUsage, ToolSchema } from '../providers/types.js';
import type { ContextHealth } from '../context/health.js';
import type { AllowRule } from '../security/permissions.js';
import type { ApprovalResult } from '../tui/components/ApprovalPrompt.js';
import { getProvider } from '../providers/registry.js';
import { buildContext } from './context.js';
import { addMessage, addSessionTokens } from '../session/manager.js';
import { shouldEmergencyCompact, getEmergencyKeepCount } from '../context/health.js';
import { log } from '../observability/logger.js';
import { chooseIterationModel, type ModelPlan } from './model-selection.js';
import { evaluateToolCall } from './security-gate.js';
import { runToolCall } from './tool-executor.js';
import { needsToolCalling } from './heuristics.js';
import { performEmergencyCompaction } from './compactor.js';

export interface IterationEventSink {
  thinking(): void;
  chunk(text: string): void;
  toolCall(tc: ToolCall): void;
  toolResult(name: string, text: string, success: boolean): void;
  compacting(): void;
  contextHealth(health: ContextHealth): void;
  usage(usage: TokenUsage): void;
  clearStreaming(): void;
  modelSwitch(model: string): void;
}

export interface IterationDeps {
  sessionId: string;
  plan: ModelPlan;
  toolSchemas: ToolSchema[];
  allowRules: AllowRule[];
  planMode: boolean;
  temperament: string;
  maxIterations: number;
  extraSystemContent?: string;
  signal: AbortSignal | undefined;
  /** Mutable across iterations — flipped by the security gate when the user picks "approve all". */
  approvedAllRef: { current: boolean };
  requestApproval: (toolName: string, args: Record<string, unknown>) => Promise<ApprovalResult>;
  emit: IterationEventSink;
}

export interface IterationState {
  iteration: number;
  switchedToCloud: boolean;
  lastHadToolCalls: boolean;
  retryCount: number;
}

export type IterationOutcome =
  | { kind: 'continue'; state: IterationState }
  | { kind: 'done'; fullText: string }
  | { kind: 'aborted' }
  | { kind: 'error'; message: string };

export async function runOneIteration(
  deps: IterationDeps,
  prevState: IterationState,
): Promise<IterationOutcome> {
  const {
    sessionId, plan, toolSchemas, allowRules, planMode, temperament, maxIterations,
    extraSystemContent, signal, approvedAllRef, requestApproval, emit,
  } = deps;

  if (signal?.aborted) return { kind: 'aborted' };

  const iteration = prevState.iteration + 1;
  let { switchedToCloud, lastHadToolCalls, retryCount } = prevState;

  emit.thinking();

  const { model: currentModel, tools: currentTools, useLocalFirst } = chooseIterationModel(
    plan,
    iteration,
    switchedToCloud,
    toolSchemas,
  );

  const ctx = await buildContext(sessionId, currentModel, {
    planMode, temperament, iteration, maxIterations, extraSystemContent,
  });
  let messages = ctx.messages;
  const { budget } = ctx;
  let currentHealth = ctx.health;

  emit.contextHealth(currentHealth);

  if (shouldEmergencyCompact(currentHealth)) {
    emit.compacting();
    const keepCount = getEmergencyKeepCount(currentHealth);
    await performEmergencyCompaction(sessionId, plan.auxModel, keepCount);
    const rebuilt = await buildContext(sessionId, currentModel, {
      planMode, temperament, iteration, maxIterations, extraSystemContent,
    });
    emit.contextHealth(rebuilt.health);
    messages = rebuilt.messages;
    currentHealth = rebuilt.health;
  }

  let fullText = '';
  const toolCalls: ToolCall[] = [];
  const provider = getProvider('ollama');

  const stream = provider.chat({ model: currentModel, messages, tools: currentTools });
  for await (const chunk of stream) {
    switch (chunk.type) {
      case 'text':
        fullText += chunk.text!;
        emit.chunk(chunk.text!);
        break;
      case 'tool_call':
        toolCalls.push(chunk.toolCall!);
        emit.toolCall(chunk.toolCall!);
        break;
      case 'done':
        if (chunk.usage) {
          const total = chunk.usage.promptTokens + chunk.usage.completionTokens;
          addSessionTokens(sessionId, total);
          emit.usage(chunk.usage);
        }
        break;
      case 'error':
        if (lastHadToolCalls && retryCount < 1) {
          retryCount++;
          log.retry({ sessionId, iteration, kind: 'stream' });
          emit.clearStreaming();
          fullText = '__RETRY__';
        } else {
          return { kind: 'error', message: chunk.error! };
        }
    }
  }

  if (fullText === '__RETRY__') {
    return { kind: 'continue', state: { iteration, switchedToCloud, lastHadToolCalls, retryCount } };
  }

  const localFailedTools = plan.localHasTools && plan.hasToolModel && !switchedToCloud
    && toolCalls.length === 0 && needsToolCalling(fullText);
  if ((useLocalFirst || localFailedTools) && toolCalls.length === 0 && needsToolCalling(fullText)) {
    emit.clearStreaming();
    switchedToCloud = true;
    emit.chunk(`🔄 Trocando para ${plan.loopModel} para executar ferramentas...\n\n`);
    emit.modelSwitch(plan.loopModel);
    return { kind: 'continue', state: { iteration, switchedToCloud, lastHadToolCalls, retryCount } };
  }

  if (fullText === '' && toolCalls.length === 0 && lastHadToolCalls && retryCount < 1) {
    retryCount++;
    log.retry({ sessionId, iteration, kind: 'empty' });
    return { kind: 'continue', state: { iteration, switchedToCloud, lastHadToolCalls, retryCount } };
  }

  addMessage(
    sessionId,
    'assistant',
    fullText,
    toolCalls.length > 0 ? toolCalls : undefined,
    undefined,
    undefined,
    currentModel,
  );

  if (toolCalls.length === 0) {
    return { kind: 'done', fullText };
  }

  retryCount = 0;

  for (const tc of toolCalls) {
    if (signal?.aborted) return { kind: 'aborted' };
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
      health: currentHealth,
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

  lastHadToolCalls = true;

  return { kind: 'continue', state: { iteration, switchedToCloud, lastHadToolCalls, retryCount } };
}
