import type { ToolCall, TokenUsage, ToolSchema } from '../providers/types.js';
import type { ContextHealth } from '../context/health.js';
import type { AllowRule } from '../security/permissions.js';
import type { QuotaGuard } from '../security/rate-limit.js';
import type { ApprovalResult } from '../tui/components/ApprovalPrompt.js';
import { addMessage } from '../session/manager.js';
import { recordEvent } from '../observability/logger.js';
import { chooseIterationModel, type ModelPlan } from './model-selection.js';
import { prepareIterationContext } from './iteration/context-prep.js';
import { streamLLMChat } from './iteration/llm-chat.js';
import { decidePreMessage, decidePostMessage } from './iteration/decisions.js';
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
  turnId: string;
  plan: ModelPlan;
  toolSchemas: ToolSchema[];
  allowRules: AllowRule[];
  planMode: boolean;
  temperament: string;
  maxIterations: number;
  extraSystemContent?: string;
  /** Static trusted instruction supplied only to this iteration; never persisted. */
  transientSystemContent?: string;
  /** Discarded assistant draft supplied only to the recovery iteration; never persisted. */
  transientAssistantContent?: string;
  /**
   * Whether the active skill (or default flow) expects the model to use tools.
   * Dialogue-only skills set this `false` via `expects_tools: false` to opt out
   * of the intent-without-action nudge/warning path.
   */
  skillExpectsTools: boolean;
  signal: AbortSignal | undefined;
  /** Mutable across iterations — flipped by the security gate when the user picks "approve all". */
  approvedAllRef: { current: boolean };
  requestApproval: (toolName: string, args: Record<string, unknown>) => Promise<ApprovalResult>;
  quotas?: QuotaGuard;
  emit: IterationEventSink;
}

export interface IterationState {
  iteration: number;
  switchedToCloud: boolean;
  lastHadToolCalls: boolean;
  retryCount: number;
  /** Set after the intent-without-action nudge has been injected exactly once per turn. */
  intentNudgeUsed: boolean;
}

export type IterationContinuationReason = 'internal-retry' | 'model-switch' | 'tool-calls';

export type IterationOutcome =
  | { kind: 'continue'; state: IterationState; reason: IterationContinuationReason }
  | { kind: 'done'; fullText: string }
  | { kind: 'nudge-intent'; fullText: string; state: IterationState }
  | { kind: 'done-with-warning'; fullText: string; message: string }
  | { kind: 'aborted' }
  | { kind: 'error'; message: string };

export async function runOneIteration(
  deps: IterationDeps,
  prevState: IterationState,
): Promise<IterationOutcome> {
  const {
    sessionId, turnId, plan, toolSchemas, allowRules, planMode, temperament, maxIterations,
    extraSystemContent, transientSystemContent, transientAssistantContent,
    signal, approvedAllRef, requestApproval, quotas, emit,
  } = deps;

  if (signal?.aborted) return { kind: 'aborted' };

  const iteration = prevState.iteration + 1;
  let { switchedToCloud, lastHadToolCalls, retryCount, intentNudgeUsed } = prevState;

  emit.thinking();

  const { model: currentModel, tools: currentTools, useLocalFirst } = chooseIterationModel(
    plan,
    iteration,
    switchedToCloud,
    toolSchemas,
  );

  // With routing on, this is a gather iteration on the small routing model:
  // its prose is internal, so it is not streamed to the user.
  const routingActive = Boolean(plan.routeTools);

  const { messages, budget, health } = await prepareIterationContext({
    sessionId,
    turnId,
    currentModel,
    auxModel: plan.auxModel,
    options: {
      planMode, temperament, iteration, maxIterations,
      extraSystemContent, transientSystemContent, transientAssistantContent,
    },
    emit,
  });

  const streamed = await streamLLMChat({
    sessionId,
    turnId,
    iteration,
    model: currentModel,
    messages,
    tools: currentTools,
    canRetryOnError: lastHadToolCalls && retryCount < 1,
    emit,
    pass: 'main',
    suppressText: routingActive,
  });

  if (streamed.kind === 'error') {
    return { kind: 'error', message: streamed.message };
  }
  if (streamed.kind === 'retry') {
    retryCount++;
    return {
      kind: 'continue',
      reason: 'internal-retry',
      state: { iteration, switchedToCloud, lastHadToolCalls, retryCount, intentNudgeUsed },
    };
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
    return {
      kind: 'continue',
      reason: 'model-switch',
      state: { iteration, switchedToCloud, lastHadToolCalls, retryCount, intentNudgeUsed },
    };
  }

  if (decision.kind === 'empty-retry') {
    retryCount++;
    recordEvent('retry', { turnId, sessionId, iteration, kind: 'empty' });
    return {
      kind: 'continue',
      reason: 'internal-retry',
      state: { iteration, switchedToCloud, lastHadToolCalls, retryCount, intentNudgeUsed },
    };
  }

  // Routing: the small gather model emitted no tool calls — it has gathered
  // enough. Discard its draft and synthesise the answer with the requested
  // model in a dedicated pass.
  if (routingActive && toolCalls.length === 0) {
    return runSynthesisPass(deps, {
      iteration,
      switchedToCloud,
      lastHadToolCalls,
      retryCount,
      intentNudgeUsed,
    });
  }

  if (toolCalls.length === 0) {
    const outcome = decideTextOnlyOutcome(deps, fullText, {
      iteration,
      switchedToCloud,
      lastHadToolCalls,
      retryCount,
      intentNudgeUsed,
    });
    if (outcome.kind !== 'nudge-intent') {
      addMessage(sessionId, 'assistant', fullText, undefined, undefined, undefined, currentModel);
    }
    return outcome;
  }

  addMessage(sessionId, 'assistant', fullText, toolCalls, undefined, undefined, currentModel);

  retryCount = 0;

  const { aborted } = await executeIterationTools({
    sessionId,
    turnId,
    iteration,
    toolCalls,
    messages,
    correctionModel: currentModel,
    budget,
    health,
    allowRules,
    approvedAllRef,
    requestApproval,
    quotas,
    signal,
    emit,
  });

  if (aborted) return { kind: 'aborted' };

  lastHadToolCalls = true;
  return {
    kind: 'continue',
    reason: 'tool-calls',
    state: { iteration, switchedToCloud, lastHadToolCalls, retryCount, intentNudgeUsed },
  };
}

/**
 * Final pass for a routed turn: the requested model synthesises the answer
 * from the full context the small routing model gathered. No tools are
 * offered — gathering is complete — and the output is streamed to the user.
 */
async function runSynthesisPass(
  deps: IterationDeps,
  state: IterationState,
): Promise<IterationOutcome> {
  const {
    sessionId, turnId, plan, planMode, temperament, maxIterations,
    extraSystemContent, transientSystemContent, transientAssistantContent, emit,
  } = deps;
  const { iteration } = state;

  emit.thinking();

  const { messages } = await prepareIterationContext({
    sessionId,
    turnId,
    currentModel: plan.auxModel,
    auxModel: plan.auxModel,
    options: {
      planMode, temperament, iteration, maxIterations,
      extraSystemContent, transientSystemContent, transientAssistantContent,
    },
    emit,
  });

  const streamed = await streamLLMChat({
    sessionId,
    turnId,
    iteration,
    model: plan.auxModel,
    messages,
    tools: undefined,
    canRetryOnError: false,
    emit,
    pass: 'synthesis',
  });

  if (streamed.kind !== 'ok') {
    return {
      kind: 'error',
      message: streamed.kind === 'error' ? streamed.message : 'synthesis pass failed',
    };
  }

  const outcome = decideTextOnlyOutcome(deps, streamed.fullText, state);
  if (outcome.kind !== 'nudge-intent') {
    addMessage(sessionId, 'assistant', streamed.fullText, undefined, undefined, undefined, plan.auxModel);
  }
  return outcome;
}

function decideTextOnlyOutcome(
  deps: IterationDeps,
  fullText: string,
  state: IterationState,
): IterationOutcome {
  const post = decidePostMessage({
    fullText,
    toolCalls: [],
    intentNudgeUsed: state.intentNudgeUsed,
    skillExpectsTools: deps.skillExpectsTools,
    hasIterationBudget: state.iteration < deps.maxIterations,
  });

  if (post.kind === 'nudge-intent') {
    return {
      kind: 'nudge-intent',
      fullText,
      state: { ...state, intentNudgeUsed: true },
    };
  }

  if (post.kind === 'done-with-warning') {
    const reason = state.intentNudgeUsed
      ? 'já tentei lembrá-lo uma vez'
      : 'o limite de iterações não permite uma tentativa de recuperação';
    return {
      kind: 'done-with-warning',
      fullText,
      message: `⚠ O modelo anunciou ações mas não chamou nenhuma ferramenta — ${reason}. Reformule o pedido, troque o modelo, ou verifique se o skill atual permite tool use.`,
    };
  }

  return { kind: 'done', fullText };
}
