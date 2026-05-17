import type { ToolCall, TokenUsage, ToolSchema } from '../providers/types.js';
import type { ContextHealth } from '../context/health.js';
import type { AllowRule } from '../security/permissions.js';
import type { ApprovalResult } from '../tui/components/ApprovalPrompt.js';
import { addMessage } from '../session/manager.js';
import { log } from '../observability/logger.js';
import { chooseIterationModel, type ModelPlan } from './model-selection.js';
import { prepareIterationContext } from './iteration/context-prep.js';
import { streamLLMChat } from './iteration/llm-chat.js';
import { decidePreMessage } from './iteration/decisions.js';
import { executeIterationTools } from './iteration/tool-execution.js';

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

type IterationOutcome =
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

  const { messages, budget, health } = await prepareIterationContext({
    sessionId,
    currentModel,
    auxModel: plan.auxModel,
    options: { planMode, temperament, iteration, maxIterations, extraSystemContent },
    emit,
  });

  const streamed = await streamLLMChat({
    sessionId,
    iteration,
    model: currentModel,
    messages,
    tools: currentTools,
    canRetryOnError: lastHadToolCalls && retryCount < 1,
    emit,
  });

  if (streamed.kind === 'error') {
    return { kind: 'error', message: streamed.message };
  }
  if (streamed.kind === 'retry') {
    retryCount++;
    return { kind: 'continue', state: { iteration, switchedToCloud, lastHadToolCalls, retryCount } };
  }

  const { fullText, toolCalls } = streamed;

  const decision = decidePreMessage({
    fullText, toolCalls, plan, switchedToCloud, lastHadToolCalls, retryCount, useLocalFirst,
  });

  if (decision.kind === 'switch-to-cloud') {
    emit.clearStreaming();
    switchedToCloud = true;
    emit.chunk(`🔄 Trocando para ${decision.newModel} para executar ferramentas...\n\n`);
    emit.modelSwitch(decision.newModel);
    return { kind: 'continue', state: { iteration, switchedToCloud, lastHadToolCalls, retryCount } };
  }

  if (decision.kind === 'empty-retry') {
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

  const { aborted } = await executeIterationTools({
    sessionId,
    iteration,
    toolCalls,
    messages,
    correctionModel: currentModel,
    budget,
    health,
    allowRules,
    approvedAllRef,
    requestApproval,
    signal,
    emit,
  });

  if (aborted) return { kind: 'aborted' };

  lastHadToolCalls = true;
  return { kind: 'continue', state: { iteration, switchedToCloud, lastHadToolCalls, retryCount } };
}
