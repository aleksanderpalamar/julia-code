import { EventEmitter } from 'node:events';
import type { ToolCall, TokenUsage } from '../providers/types.js';
import { getToolSchemas } from '../tools/registry.js';
import { addMessage } from '../session/manager.js';
import { getConfig } from '../config/index.js';
import { type ContextHealth } from '../context/health.js';
import { setCurrentSessionId } from '../tools/memory.js';
import { setSubagentSessionId } from '../tools/subagent.js';
import { type AllowRule } from '../security/permissions.js';
import { log } from '../observability/logger.js';
import { maybeGenerateTitle } from './title-generator.js';
import { maybeCompact } from './compactor.js';
import { resolveModelPlan } from './model-selection.js';
import { runOneIteration, type IterationDeps, type IterationEventSink, type IterationState } from './iteration.js';
import { runOrchestration, type OrchestrationEventSink, type OrchestrationProgress } from './orchestrator/index.js';
import type { ApprovalResult } from '../tui/components/ApprovalPrompt.js';

export type { OrchestrationProgress };

export interface AgentEvents {
  thinking: [];
  chunk: [text: string];
  tool_call: [toolCall: ToolCall];
  tool_result: [name: string, result: string, success: boolean];
  approval_needed: [toolName: string, args: Record<string, unknown>, respond: (result: ApprovalResult) => void];
  compacting: [];
  context_health: [health: ContextHealth];
  usage: [usage: TokenUsage];
  title: [title: string];
  model_switch: [model: string];
  clear_streaming: [];
  orchestration_progress: [progress: OrchestrationProgress];
  subagent_chunk: [taskId: string, label: string, text: string];
  subagent_status: [taskId: string, label: string, status: string, durationMs?: number];
  done: [fullText: string];
  error: [error: string];
}

export interface AgentLoopOptions {
  maxIterations?: number;
  excludeTools?: string[];
}

export class AgentLoop extends EventEmitter<AgentEvents> {
  private running = false;
  private options: AgentLoopOptions;
  private planMode = false;
  private temperament = 'neutral';
  private approvedAllForSession = false;
  private allowRules: AllowRule[] = [];
  private abortController: AbortController | null = null;

  constructor(options?: AgentLoopOptions) {
    super();
    this.options = options ?? {};
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.running = false;
  }

  setAllowRules(rules: AllowRule[]): void {
    this.allowRules = rules;
  }

  setExcludeTools(tools: string[]): void {
    this.options.excludeTools = tools;
  }

  setPlanMode(enabled: boolean): void {
    this.planMode = enabled;
  }

  setTemperament(t: string): void {
    this.temperament = t;
  }

  async run(sessionId: string, userMessage: string, model?: string, images?: string[]): Promise<void> {
    if (this.running) {
      this.emit('error', 'Agent is already running');
      return;
    }

    this.running = true;
    this.abortController = new AbortController();
    setCurrentSessionId(sessionId);
    setSubagentSessionId(sessionId);
    const config = getConfig();
    const requestedModel = model ?? config.defaultModel;

    const plan = await resolveModelPlan(requestedModel, config.toolModel);
    const { loopModel, auxModel } = plan;

    if (plan.hasToolModel && !plan.localHasTools) {
      this.emit('model_switch', loopModel);
    }

    let toolSchemas = getToolSchemas();
    if (this.options.excludeTools?.length) {
      toolSchemas = toolSchemas.filter(s => !this.options.excludeTools!.includes(s.function.name));
    }
    const maxIterations = this.options.maxIterations ?? config.maxToolIterations;

    const approvedAllRef = { current: this.approvedAllForSession };
    let state: IterationState = { iteration: 0, switchedToCloud: false, lastHadToolCalls: false, retryCount: 0 };

    try {
      addMessage(sessionId, 'user', userMessage, undefined, undefined, images);

      this.emit('thinking');

      if (config.acpEnabled && config.acpAutoOrchestrate && !this.options.excludeTools?.includes('subagent')) {
        const orchestrated = await runOrchestration({
          sessionId,
          userMessage,
          model: auxModel,
          emit: this.orchestrationSink(),
        });
        if (orchestrated) {
          this.running = false;
          return;
        }
      }

      if (await maybeCompact(sessionId, auxModel)) {
        this.emit('compacting');
      }

      const deps: IterationDeps = {
        sessionId,
        plan,
        toolSchemas,
        allowRules: this.allowRules,
        planMode: this.planMode,
        temperament: this.temperament,
        maxIterations,
        signal: this.abortController.signal,
        approvedAllRef,
        requestApproval: (n, a) => this.requestApproval(n, a),
        emit: this.iterationSink(),
      };

      while (state.iteration < maxIterations) {
        const outcome = await runOneIteration(deps, state);

        if (outcome.kind === 'continue') {
          state = outcome.state;
          continue;
        }

        this.approvedAllForSession = approvedAllRef.current;

        if (outcome.kind === 'done') {
          log.loopEnd({ sessionId, iterations: state.iteration + 1, reason: 'done' });
          this.emit('done', outcome.fullText);
          void maybeGenerateTitle(sessionId, auxModel, userMessage, outcome.fullText).then(title => {
            if (title) this.emit('title', title);
          });
          this.running = false;
          return;
        }

        if (outcome.kind === 'aborted') {
          log.loopEnd({ sessionId, iterations: state.iteration, reason: 'aborted' });
          this.emit('error', 'Aborted');
          this.running = false;
          return;
        }

        if (outcome.kind === 'error') {
          log.loopEnd({ sessionId, iterations: state.iteration + 1, reason: 'error' });
          this.emit('error', outcome.message);
          this.emit('done', '');
          this.running = false;
          return;
        }
      }

      this.approvedAllForSession = approvedAllRef.current;
      log.loopEnd({ sessionId, iterations: state.iteration, reason: 'max_iterations' });
      addMessage(sessionId, 'assistant', '[Max tool iterations reached]', undefined, undefined, undefined, auxModel);
      this.emit('done', '[Max tool iterations reached]');
    } catch (err) {
      log.loopEnd({ sessionId, iterations: state.iteration, reason: 'error' });
      this.emit('error', err instanceof Error ? err.message : String(err));
    } finally {
      this.running = false;
    }
  }

  private iterationSink(): IterationEventSink {
    return {
      thinking: () => this.emit('thinking'),
      chunk: (text) => this.emit('chunk', text),
      toolCall: (tc) => this.emit('tool_call', tc),
      toolResult: (name, text, success) => this.emit('tool_result', name, text, success),
      compacting: () => this.emit('compacting'),
      contextHealth: (health) => this.emit('context_health', health),
      usage: (usage) => this.emit('usage', usage),
      clearStreaming: () => this.emit('clear_streaming'),
      modelSwitch: (m) => this.emit('model_switch', m),
    };
  }

  private orchestrationSink(): OrchestrationEventSink {
    return {
      chunk: (text) => this.emit('chunk', text),
      usage: (usage) => this.emit('usage', usage),
      done: (fullText) => this.emit('done', fullText),
      title: (title) => this.emit('title', title),
      subagentChunk: (taskId, label, text) => this.emit('subagent_chunk', taskId, label, text),
      subagentStatus: (taskId, label, status, durationMs) => this.emit('subagent_status', taskId, label, status, durationMs),
      progress: (progress) => this.emit('orchestration_progress', progress),
    };
  }

  private requestApproval(toolName: string, args: Record<string, unknown>): Promise<ApprovalResult> {
    return new Promise<ApprovalResult>((resolve) => {
      if (this.listenerCount('approval_needed') === 0) {
        resolve('approve');
        return;
      }

      this.emit('approval_needed', toolName, args, (result: ApprovalResult) => {
        resolve(result);
      });
    });
  }

  isRunning(): boolean {
    return this.running;
  }
}
