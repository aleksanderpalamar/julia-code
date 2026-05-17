import { EventEmitter } from 'node:events';
import { getToolSchemas } from '../tools/registry.js';
import { addMessage, getMessageCount } from '../session/manager.js';
import { getConfig } from '../config/index.js';
import { setCurrentSessionId } from '../tools/memory.js';
import { setSubagentSessionId } from '../tools/subagent.js';
import { type AllowRule } from '../security/permissions.js';
import { log } from '../observability/logger.js';
import { maybeGenerateTitle } from './title-generator.js';
import { resolveModelPlan } from './model-selection.js';
import { runOneIteration, type IterationDeps, type IterationState } from './iteration.js';
import type { AgentEvents, OrchestrationProgress } from './loop/events.js';
import { createIterationSink, createOrchestrationSink } from './loop/event-bridge.js';
import { requestApproval, SessionApprovalState } from './loop/approval-gate.js';
import { maybeAutoOrchestrate, maybeRunCompaction } from './loop/workflow-decisions.js';
import { runHook } from '../hooks/runner.js';
import { resolveMentionsInPrompt, buildMentionContextBlock } from '../repo-intel/mention-resolver.js';

export type { AgentEvents, OrchestrationProgress };

const sessionStartFired = new Set<string>();

interface AgentLoopOptions {
  maxIterations?: number;
  excludeTools?: string[];
  isSubagent?: boolean;
}

export class AgentLoop extends EventEmitter<AgentEvents> {
  private running = false;
  private options: AgentLoopOptions;
  private planMode = false;
  private temperament = 'neutral';
  private approval = new SessionApprovalState();
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

  async run(sessionId: string, userMessage: string, model?: string, images?: string[], skillContent?: string): Promise<void> {
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

    const plan = await resolveModelPlan(requestedModel, config.toolModel, config.toolPickModel);
    const { loopModel, auxModel } = plan;

    if (plan.hasToolModel && !plan.localHasTools) {
      this.emit('model_switch', loopModel);
    }

    let toolSchemas = getToolSchemas();
    if (this.options.excludeTools?.length) {
      toolSchemas = toolSchemas.filter(s => !this.options.excludeTools!.includes(s.function.name));
    }
    const maxIterations = this.options.maxIterations ?? config.maxToolIterations;

    const approvedAllRef = this.approval.createIterationRef();
    let state: IterationState = { iteration: 0, switchedToCloud: false, lastHadToolCalls: false, retryCount: 0 };
    let stopHookActive = false;

    try {
      if (!this.options.isSubagent && !sessionStartFired.has(sessionId)) {
        sessionStartFired.add(sessionId);
        const source: 'startup' | 'resume' = getMessageCount(sessionId) > 0 ? 'resume' : 'startup';
        const startHook = await runHook('SessionStart', {
          session_id: sessionId,
          cwd: process.cwd(),
          hook_event_name: 'SessionStart',
          source,
        });
        if (startHook.additionalContext) {
          addMessage(sessionId, 'system', `[SessionStart hook context]\n${startHook.additionalContext}`);
        }
      }

      if (!this.options.isSubagent) {
        const submitHook = await runHook('UserPromptSubmit', {
          session_id: sessionId,
          cwd: process.cwd(),
          hook_event_name: 'UserPromptSubmit',
          prompt: userMessage,
        });
        if (submitHook.decision === 'block') {
          this.emit('error', submitHook.reason ?? 'Blocked by UserPromptSubmit hook');
          this.running = false;
          return;
        }
        if (submitHook.additionalContext) {
          userMessage = `${submitHook.additionalContext}\n\n${userMessage}`;
        }

        const mentions = await resolveMentionsInPrompt(userMessage);
        if (mentions.resolved.length > 0) {
          const block = buildMentionContextBlock(mentions.resolved);
          userMessage = `${block}\n\n${userMessage}`;
        }
        for (const err of mentions.errors) {
          this.emit('error', err);
        }
      }

      addMessage(sessionId, 'user', userMessage, undefined, undefined, images);

      this.emit('thinking');

      const orchestrated = await maybeAutoOrchestrate({
        sessionId,
        userMessage,
        model: auxModel,
        excludeTools: this.options.excludeTools,
        emit: createOrchestrationSink(this),
      });
      if (orchestrated) {
        this.running = false;
        return;
      }

      const compacted = await maybeRunCompaction(sessionId, auxModel, async () => {
        const preCompact = await runHook('PreCompact', {
          session_id: sessionId,
          cwd: process.cwd(),
          hook_event_name: 'PreCompact',
          trigger: 'auto',
          custom_instructions: '',
        });
        if (preCompact.decision === 'block') return false;
        if (preCompact.additionalContext) {
          addMessage(sessionId, 'system', `[PreCompact hook context]\n${preCompact.additionalContext}`);
        }
        return true;
      });
      if (compacted) this.emit('compacting');

      const deps: IterationDeps = {
        sessionId,
        plan,
        toolSchemas,
        allowRules: this.allowRules,
        planMode: this.planMode,
        temperament: this.temperament,
        maxIterations,
        extraSystemContent: skillContent,
        signal: this.abortController.signal,
        approvedAllRef,
        requestApproval: (toolName, args) => requestApproval({ toolName, args, emitter: this }),
        emit: createIterationSink(this),
      };

      while (state.iteration < maxIterations) {
        const outcome = await runOneIteration(deps, state);

        if (outcome.kind === 'continue') {
          state = outcome.state;
          continue;
        }

        this.approval.syncFromRef(approvedAllRef);

        if (outcome.kind === 'done') {
          const stopEvent = this.options.isSubagent ? 'SubagentStop' : 'Stop';
          const stopHook = await runHook(stopEvent, {
            session_id: sessionId,
            cwd: process.cwd(),
            hook_event_name: stopEvent,
            stop_hook_active: stopHookActive,
          });
          if (stopHook.decision === 'block' && !stopHookActive) {
            stopHookActive = true;
            const reason = stopHook.reason ?? `${stopEvent} hook requested continuation.`;
            addMessage(sessionId, 'system', `[${stopEvent} hook] ${reason}`);
            state = { ...state, iteration: state.iteration + 1 };
            continue;
          }
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

      this.approval.syncFromRef(approvedAllRef);
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

  isRunning(): boolean {
    return this.running;
  }
}
