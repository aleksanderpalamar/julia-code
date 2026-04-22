import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { ChatMessage, ToolCall, TokenUsage } from '../providers/types.js';
import { getProvider } from '../providers/registry.js';
import { getToolSchemas } from '../tools/registry.js';
import { addMessage, addSessionTokens, createOrchestrationRun, completeOrchestrationRun } from '../session/manager.js';
import { getConfig } from '../config/index.js';
import { type ContextHealth } from '../context/health.js';
import { setCurrentSessionId } from '../tools/memory.js';
import { setSubagentSessionId } from '../tools/subagent.js';
import { getSubagentManager } from './subagent.js';
import { listOllamaModels } from '../providers/ollama.js';
import { type AllowRule } from '../security/permissions.js';
import { log } from '../observability/logger.js';
import { analyzeComplexity } from './complexity.js';
import { getCachedPlannerResult, setCachedPlannerResult } from './planner-cache.js';
import { maybeGenerateTitle } from './title-generator.js';
import { maybeCompact, buildSharedContextSnapshot } from './compactor.js';
import { resolveModelPlan } from './model-selection.js';
import { runOneIteration, type IterationDeps, type IterationEventSink, type IterationState } from './iteration.js';
import type { ApprovalResult } from '../tui/components/ApprovalPrompt.js';

export interface OrchestrationProgress {
  runId: string;
  total: number;
  completed: number;
  failed: number;
  running: number;
  queued: number;
}

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
        const orchestrated = await this.maybeOrchestrate(sessionId, userMessage, auxModel);
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

  private async maybeOrchestrate(sessionId: string, userMessage: string, model: string): Promise<boolean> {
    const plannerStart = Date.now();
    const taskPreview = userMessage.slice(0, 120).replace(/\n/g, ' ');

    // Fase 1: heurística determinística. Se não parece complexa, pula o LLM
    // e cai direto no loop do agente pai — economiza um round-trip.
    const heuristic = analyzeComplexity(userMessage);
    if (!heuristic.complex) {
      log.plannerDecision({
        sessionId,
        complex: false,
        subtaskCount: 0,
        via: 'heuristic',
        durationMs: Date.now() - plannerStart,
        taskPreview,
      });
      return false;
    }

    try {
      const provider = getProvider('ollama');
      const availableModels = await listOllamaModels();

      let analysis: { complex: boolean; subtasks?: Array<{ task: string; model?: string | null }> };
      let plannerVia: 'llm' | 'cache';

      const cached = getCachedPlannerResult(sessionId, userMessage);
      if (cached) {
        analysis = cached;
        plannerVia = 'cache';
      } else {
        plannerVia = 'llm';

        const modelsInfo = availableModels.length > 0
          ? `Available models: ${availableModels.join(', ')}`
          : 'No model list available — use null for model to use the default.';

        const messages: ChatMessage[] = [
          {
            role: 'system',
            content: `You are a task decomposer. The user task has already been flagged as likely complex by a heuristic — your job is to split it into 2+ independent subtasks that can run in parallel.

Rules:
- Only split into subtasks that are CLEARLY INDEPENDENT (no sequential dependencies between them).
- If, after inspection, the task is actually simple or sequential, return {"complex": false} — this overrides the heuristic.
- If you can only think of 1 subtask, return {"complex": false} (the parent loop will handle it).
- Prefer 2–6 subtasks. Avoid splitting into more parts than are actually independent.

${modelsInfo}

You can assign different models to subtasks based on their nature:
- Use larger/stronger models for complex coding tasks
- Use smaller/faster models for simple file operations or text generation
- Use null to use the default model
- IMPORTANT: You MUST use the EXACT full model name as it appears in the available models list above (including the tag after the colon). Do NOT abbreviate or truncate model names.

Respond with ONLY valid JSON, no markdown, no explanation:
{"complex": false}

OR if decomposable:
{"complex": true, "subtasks": [{"task": "detailed description of subtask 1", "model": "model-name or null"}, ...]}

Each subtask description must be self-contained with ALL context needed (file paths, requirements, style). The subagent will NOT see the original conversation.`,
          },
          {
            role: 'user',
            content: userMessage,
          },
        ];

        let response = '';
        const stream = provider.chat({ model, messages });
        for await (const chunk of stream) {
          if (chunk.type === 'error') return false;
          if (chunk.type === 'text' && chunk.text) {
            response += chunk.text;
          }
        }

        response = response.trim();
        if (response.startsWith('```')) {
          response = response.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
        }

        try {
          analysis = JSON.parse(response);
        } catch {
          log.plannerDecision({
            sessionId,
            complex: false,
            subtaskCount: 0,
            via: 'llm',
            durationMs: Date.now() - plannerStart,
            taskPreview,
          });
          return false;
        }

        setCachedPlannerResult(sessionId, userMessage, analysis);
      }

      if (!analysis.complex || !analysis.subtasks?.length) {
        log.plannerDecision({
          sessionId,
          complex: false,
          subtaskCount: analysis.subtasks?.length ?? 0,
          via: plannerVia,
          durationMs: Date.now() - plannerStart,
          taskPreview,
        });
        return false;
      }

      if (analysis.subtasks.length === 1) {
        log.plannerDecision({
          sessionId,
          complex: false,
          subtaskCount: 1,
          via: plannerVia,
          durationMs: Date.now() - plannerStart,
          taskPreview,
        });
        return false;
      }

      if (availableModels.length > 0) {
        for (const sub of analysis.subtasks) {
          if (sub.model && sub.model !== 'null') {
            if (!availableModels.includes(sub.model)) {
              const match = availableModels.find(m => m.startsWith(sub.model + ':') || m === sub.model);
              if (match) {
                sub.model = match;
              } else {
                sub.model = null;
              }
            }
          }
        }
      }

      const runId = randomUUID();
      const orchestrationStart = Date.now();

      createOrchestrationRun(runId, sessionId, userMessage, analysis.subtasks.length);
      log.plannerDecision({
        sessionId,
        complex: true,
        subtaskCount: analysis.subtasks.length,
        via: plannerVia,
        durationMs: Date.now() - plannerStart,
        taskPreview,
      });

      this.emit('chunk', `🔀 Tarefa complexa detectada — spawnando ${analysis.subtasks.length} subagentes... (run: ${runId.slice(0, 8)})\n\n`);

      const manager = getSubagentManager();

      manager.prewarm(analysis.subtasks.length);

      // Fase 2.1: build a read-only snapshot of the parent session's compacted
      // context. Capped at ~500 tokens per subagent — the same snapshot is
      // reused across all spawned subagents, so cost scales linearly with the
      // number of subtasks.
      const sharedContext = buildSharedContextSnapshot(sessionId);

      const subtaskDescriptors = analysis.subtasks.map(sub => ({
        task: sub.task,
        model: (sub.model && sub.model !== 'null') ? sub.model : undefined,
        sharedContext,
      }));

      const taskLabels = new Map<string, string>();
      const spawnedTaskIds = new Set<string>();

      const onSubagentChunk = (taskId: string, text: string) => {
        if (!spawnedTaskIds.has(taskId)) return;
        const label = taskLabels.get(taskId) ?? 'subagent';
        this.emit('subagent_chunk', taskId, label, text);
      };
      const onSubagentStarted = (taskId: string) => {
        if (!spawnedTaskIds.has(taskId)) return;
        const label = taskLabels.get(taskId) ?? 'subagent';
        this.emit('subagent_status', taskId, label, 'started');
      };
      const onSubagentCompleted = (taskId: string) => {
        if (!spawnedTaskIds.has(taskId)) return;
        const label = taskLabels.get(taskId) ?? 'subagent';
        const task = manager.getTask(taskId);
        this.emit('subagent_status', taskId, label, 'completed', task?.durationMs);
      };
      const onSubagentFailed = (taskId: string) => {
        if (!spawnedTaskIds.has(taskId)) return;
        const label = taskLabels.get(taskId) ?? 'subagent';
        const task = manager.getTask(taskId);
        this.emit('subagent_status', taskId, label, 'failed', task?.durationMs);
      };

      const total = analysis.subtasks.length;
      let progressCompleted = 0;
      let progressFailed = 0;

      const emitProgress = () => {
        const ids = Array.from(spawnedTaskIds);
        const running = ids.filter(id => {
          const t = manager.getTask(id);
          return t?.status === 'running';
        }).length;
        const queued = ids.filter(id => {
          const t = manager.getTask(id);
          return t?.status === 'queued';
        }).length;
        this.emit('orchestration_progress', {
          runId,
          total,
          completed: progressCompleted,
          failed: progressFailed,
          running,
          queued,
        });
      };

      const onTaskStarted = (taskId: string) => {
        if (!spawnedTaskIds.has(taskId)) return;
        emitProgress();
      };
      const onTaskCompleted = (taskId: string) => {
        if (!spawnedTaskIds.has(taskId)) return;
        progressCompleted++;
        emitProgress();
      };
      const onTaskFailed = (taskId: string) => {
        if (!spawnedTaskIds.has(taskId)) return;
        progressFailed++;
        emitProgress();
      };

      manager.on('task:chunk', onSubagentChunk);
      manager.on('task:started', onSubagentStarted);
      manager.on('task:completed', onSubagentCompleted);
      manager.on('task:failed', onSubagentFailed);
      manager.on('task:started', onTaskStarted);
      manager.on('task:completed', onTaskCompleted);
      manager.on('task:failed', onTaskFailed);

      const taskIds = await manager.spawnMany(sessionId, subtaskDescriptors, runId);

      for (let i = 0; i < analysis.subtasks.length; i++) {
        const sub = analysis.subtasks[i];
        const label = sub.task.slice(0, 60).replace(/\n/g, ' ');
        taskLabels.set(taskIds[i], label);
        spawnedTaskIds.add(taskIds[i]);
        this.emit('chunk', `  → Subagente: ${sub.task.slice(0, 80)}${sub.model ? ` [${sub.model}]` : ''}\n`);
      }

      this.emit('chunk', `\n⏳ Aguardando ${taskIds.length} subagentes...\n`);

      emitProgress();

      const resultLines: string[] = [];
      const taskIdToIndex = new Map(taskIds.map((id, i) => [id, i]));
      let earlyCompleted = 0;
      let earlyFailed = 0;

      const results = await new Promise<import('./subagent.js').SubagentTask[]>((resolveAll) => {
        const seen = new Set<string>();

        const onEarlyResult = (taskId: string) => {
          if (!taskIds.includes(taskId)) return;
          if (seen.has(taskId)) return;           seen.add(taskId);

          const task = manager.getTask(taskId)!;
          const idx = taskIdToIndex.get(taskId)!;
          const subDesc = analysis.subtasks![idx]?.task.slice(0, 60) ?? `subtask ${idx + 1}`;

          if (task.status === 'completed') {
            earlyCompleted++;
            const line = `### Subtask ${idx + 1}: ${subDesc}\n${task.result ?? '(no output)'}`;
            resultLines[idx] = line;
            this.emit('chunk', `\n${line}\n`);
          } else {
            earlyFailed++;
            const line = `### Subtask ${idx + 1}: ${subDesc}\n❌ Failed: ${task.error ?? 'unknown error'}`;
            resultLines[idx] = line;
            this.emit('chunk', `\n${line}\n`);
          }

          if (seen.size === taskIds.length) {
            manager.off('task:completed', onEarlyResult);
            manager.off('task:failed', onEarlyResult);
            resolveAll(taskIds.map(id => manager.getTask(id)!));
          }
        };

        manager.on('task:completed', onEarlyResult);
        manager.on('task:failed', onEarlyResult);

        for (const id of taskIds) {
          const t = manager.getTask(id);
          if (t && (t.status === 'completed' || t.status === 'failed')) {
            onEarlyResult(id);
          }
        }
      });

      manager.off('task:started', onTaskStarted);
      manager.off('task:completed', onTaskCompleted);
      manager.off('task:failed', onTaskFailed);
      manager.off('task:chunk', onSubagentChunk);
      manager.off('task:started', onSubagentStarted);
      manager.off('task:completed', onSubagentCompleted);
      manager.off('task:failed', onSubagentFailed);

      const orchestrationDuration = Date.now() - orchestrationStart;
      const allDone = results.every(r => r.status === 'completed');
      completeOrchestrationRun(runId, allDone ? 'completed' : 'failed', orchestrationDuration);

      const completed = earlyCompleted;
      const failed = earlyFailed;

      this.emit('chunk', `\n✅ ${completed} completados, ${failed > 0 ? `❌ ${failed} falharam` : 'nenhuma falha'}\n\n`);

      let synthesisText = '';
      if (failed > 0) {
        try {
          const synthesisMessages: ChatMessage[] = [
            {
              role: 'system',
              content: 'You are a helpful assistant. The user gave a task that was split into subtasks and executed in parallel by subagents. Some subtasks failed. Briefly explain what succeeded and what went wrong, and suggest how to fix the failures. Be concise and direct. Respond in the same language the user used.',
            },
            {
              role: 'user',
              content: `Original request: "${userMessage}"\n\nSubagent results:\n\n${resultLines.filter(Boolean).join('\n\n---\n\n')}`,
            },
          ];

          const synthStream = provider.chat({
            model,
            messages: synthesisMessages,
          });

          for await (const chunk of synthStream) {
            if (chunk.type === 'text' && chunk.text) {
              synthesisText += chunk.text;
              this.emit('chunk', chunk.text);
            }
            if (chunk.type === 'done' && chunk.usage) {
              const totalTokens = chunk.usage.promptTokens + chunk.usage.completionTokens;
              addSessionTokens(sessionId, totalTokens);
              this.emit('usage', chunk.usage);
            }
            if (chunk.type === 'error') {
              break;
            }
          }
        } catch {
        }
      }

      const allResultsText = resultLines.filter(Boolean).join('\n\n---\n\n');
      const fullOutput = `🔀 ${analysis.subtasks.length} subagentes executados (${completed} ok, ${failed} falhas)\n\n${allResultsText}${synthesisText ? '\n\n' + synthesisText : ''}`;
      addMessage(sessionId, 'assistant', fullOutput, undefined, undefined, undefined, model);
      this.emit('done', fullOutput);
      void maybeGenerateTitle(sessionId, model, userMessage, allResultsText.slice(0, 500)).then(title => {
        if (title) this.emit('title', title);
      });
      return true;
    } catch (err) {
      return false;
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}
