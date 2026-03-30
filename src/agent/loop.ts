import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { ChatMessage, ToolCall, ChatChunk, TokenUsage } from '../providers/types.js';
import { getProvider } from '../providers/registry.js';
import { getToolSchemas, executeTool } from '../tools/registry.js';
import { buildContext, getCompactableMessages, getEmergencyCompactableMessages } from './context.js';
import { addMessage, removeLastAssistantMessage, saveCompaction, getLatestCompaction, addSessionTokens, getSession, updateSessionTitle, getMessageCount, createOrchestrationRun, completeOrchestrationRun } from '../session/manager.js';
import { getConfig } from '../config/index.js';
import { computeToolResultCap, type ContextBudget } from '../context/budget.js';
import { performStructuredCompaction, serializeCompaction, deserializeCompaction, type StructuredCompaction } from '../context/compaction.js';
import { shouldEmergencyCompact, getEmergencyKeepCount, getToolResultCapFactor, type ContextHealth } from '../context/health.js';
import { setCurrentSessionId } from '../tools/memory.js';
import { setSubagentSessionId } from '../tools/subagent.js';
import { getSubagentManager } from './subagent.js';
import { listOllamaModels } from '../providers/ollama.js';
import { wrapToolResult } from '../security/boundaries.js';
import { sanitizeToolResult } from '../security/sanitize.js';
import { getToolRisk, isBlockedCommand, matchesAllowRule, type AllowRule } from '../security/permissions.js';
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

  /** Abort the current agent run. Stops iteration and emits error. */
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
    const provider = getProvider('ollama');

    // Auto-switch: use toolModel for the main loop (with tools), requestedModel for auxiliary ops
    const loopModel = config.toolModel ?? requestedModel;
    const auxModel = requestedModel;

    if (loopModel !== requestedModel) {
      this.emit('model_switch', loopModel);
    }

    let toolSchemas = getToolSchemas();
    if (this.options.excludeTools?.length) {
      toolSchemas = toolSchemas.filter(s => !this.options.excludeTools!.includes(s.function.name));
    }
    const maxIterations = this.options.maxIterations ?? config.maxToolIterations;

    try {
      // Save user message
      addMessage(sessionId, 'user', userMessage, undefined, undefined, images);

      // Show thinking spinner immediately (before orchestration/compaction which can be slow)
      this.emit('thinking');

      // Auto-orchestrate: analyze complexity and spawn subagents if needed
      if (config.acpEnabled && config.acpAutoOrchestrate && !this.options.excludeTools?.includes('subagent')) {
        const orchestrated = await this.maybeOrchestrate(sessionId, userMessage, auxModel);
        if (orchestrated) {
          this.running = false;
          return;
        }
      }

      // Check if compaction is needed before this run (uses fast local model)
      await this.maybeCompact(sessionId, auxModel);

      let iterations = 0;
      let currentBudget: ContextBudget | null = null;
      const hasToolModel = loopModel !== auxModel;
      let switchedToCloud = false;

      while (iterations < maxIterations) {
        if (this.abortController?.signal.aborted) {
          this.emit('error', 'Aborted');
          this.running = false;
          return;
        }
        iterations++;
        this.emit('thinking');

        // Local-first routing: 1st iteration uses local model without tools,
        // subsequent iterations (or after fallback) use cloud model with tools
        const useLocalFirst = iterations === 1 && hasToolModel && !switchedToCloud;
        const currentModel = useLocalFirst ? auxModel : loopModel;
        const currentTools = useLocalFirst ? undefined : toolSchemas;

        // Build context fresh each iteration (now async with budget awareness)
        const { messages, budget, health } = await buildContext(sessionId, currentModel, {
          planMode: this.planMode,
          temperament: this.temperament,
          iteration: iterations,
          maxIterations,
        });
        currentBudget = budget;

        // Emit context health for TUI
        this.emit('context_health', health);

        // Emergency compaction if context is critically full
        if (shouldEmergencyCompact(health)) {
          this.emit('compacting');
          const keepCount = getEmergencyKeepCount(health);
          await this.performEmergencyCompaction(sessionId, auxModel, keepCount);
          // Rebuild context after emergency compaction
          const rebuilt = await buildContext(sessionId, currentModel, {
            planMode: this.planMode,
            temperament: this.temperament,
            iteration: iterations,
            maxIterations,
            });
          this.emit('context_health', rebuilt.health);
          // Use rebuilt messages
          messages.length = 0;
          messages.push(...rebuilt.messages);
        }

        // Call LLM
        let fullText = '';
        const toolCalls: ToolCall[] = [];

        const stream = provider.chat({
          model: currentModel,
          messages,
          tools: currentTools,
        });

        for await (const chunk of stream) {
          switch (chunk.type) {
            case 'text':
              fullText += chunk.text!;
              this.emit('chunk', chunk.text!);
              break;
            case 'tool_call':
              toolCalls.push(chunk.toolCall!);
              this.emit('tool_call', chunk.toolCall!);
              break;
            case 'done':
              if (chunk.usage) {
                const total = chunk.usage.promptTokens + chunk.usage.completionTokens;
                addSessionTokens(sessionId, total);
                this.emit('usage', chunk.usage);
              }
              break;
            case 'error':
              this.emit('error', chunk.error!);
              this.running = false;
              return;
          }
        }

        // Local-first: check if local model response indicates tools are needed
        if (useLocalFirst && toolCalls.length === 0 && needsToolCalling(fullText)) {
          // Discard local response and retry with cloud + tools
          this.emit('clear_streaming');
          switchedToCloud = true;
          this.emit('chunk', `🔄 Trocando para ${loopModel} para executar ferramentas...\n\n`);
          this.emit('model_switch', loopModel);
          continue;
        }

        // Save assistant message
        addMessage(sessionId, 'assistant', fullText, toolCalls.length > 0 ? toolCalls : undefined);

        // If no tool calls, we're done
        if (toolCalls.length === 0) {
          this.emit('done', fullText);
          // Generate title in background (uses fast local model)
          this.maybeGenerateTitle(sessionId, auxModel, userMessage, fullText);
          this.running = false;
          return;
        }

        // Execute tool calls and save results
        for (const tc of toolCalls) {
          if (this.abortController?.signal.aborted) {
            this.emit('error', 'Aborted');
            this.running = false;
            return;
          }
          const toolName = tc.function.name;
          const toolArgs = tc.function.arguments;

          // Security: check for blocked commands
          if (toolName === 'exec' && isBlockedCommand(toolArgs.command as string)) {
            const resultText = 'Operação bloqueada: este comando está na blocklist de segurança.';
            addMessage(sessionId, 'tool', resultText, undefined, tc.id);
            this.emit('tool_result', toolName, resultText, false);
            continue;
          }

          // Security: approval gate for dangerous tools
          const risk = getToolRisk(toolName);
          if (risk === 'dangerous' && !this.approvedAllForSession) {
            // Check allow rules first
            if (!matchesAllowRule(toolName, toolArgs, this.allowRules)) {
              const approved = await this.requestApproval(toolName, toolArgs);
              if (approved === 'deny') {
                const resultText = 'Operação negada pelo usuário.';
                addMessage(sessionId, 'tool', resultText, undefined, tc.id);
                this.emit('tool_result', toolName, resultText, false);
                continue;
              }
              if (approved === 'approve_all') {
                this.approvedAllForSession = true;
              }
            }
          }

          const result = await executeTool(toolName, toolArgs);
          let resultText = result.success
            ? result.output
            : `Error: ${result.error}\n${result.output}`;

          // Truncate large tool results with dynamic caps based on context budget
          let maxResultChars = 12000; // default fallback
          if (currentBudget) {
            maxResultChars = computeToolResultCap(currentBudget, toolName);
            // Further reduce if context health is poor
            const capFactor = getToolResultCapFactor(health);
            maxResultChars = Math.floor(maxResultChars * capFactor);
          }
          if (resultText.length > maxResultChars) {
            resultText = resultText.slice(0, maxResultChars) + '\n... [truncated — use offset/limit for large files]';
          }

          // Security: sanitize and wrap tool results with boundary markers
          resultText = sanitizeToolResult(resultText);
          resultText = wrapToolResult(toolName, resultText);

          addMessage(sessionId, 'tool', resultText, undefined, tc.id);
          this.emit('tool_result', toolName, resultText, result.success);
        }

        // Loop continues — model will see tool results and respond
      }

      // Hit max iterations
      addMessage(sessionId, 'assistant', '[Max tool iterations reached]');
      this.emit('done', '[Max tool iterations reached]');
    } catch (err) {
      this.emit('error', err instanceof Error ? err.message : String(err));
    } finally {
      this.running = false;
    }
  }

  /**
   * Request approval from the user for a dangerous tool call.
   * Returns the user's decision.
   */
  private requestApproval(toolName: string, args: Record<string, unknown>): Promise<ApprovalResult> {
    return new Promise<ApprovalResult>((resolve) => {
      // If no listeners are attached, auto-approve (headless/gateway mode)
      if (this.listenerCount('approval_needed') === 0) {
        resolve('approve');
        return;
      }

      this.emit('approval_needed', toolName, args, (result: ApprovalResult) => {
        resolve(result);
      });
    });
  }

  /**
   * Analyze task complexity and auto-spawn subagents if the task is parallelizable.
   * Returns true if orchestration happened (subagents handled the task), false otherwise.
   */
  private async maybeOrchestrate(sessionId: string, userMessage: string, model: string): Promise<boolean> {
    try {
      const provider = getProvider('ollama');
      const availableModels = await listOllamaModels();

      const modelsInfo = availableModels.length > 0
        ? `Available models: ${availableModels.join(', ')}`
        : 'No model list available — use null for model to use the default.';

      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: `You are a task complexity analyzer. Given a user task, decide if it should be split into independent subtasks that can run in parallel.

Rules:
- Only split if the task has 2+ CLEARLY INDEPENDENT parts that don't depend on each other
- Simple tasks (questions, single file edits, explanations, quick fixes) → NOT complex
- Tasks with sequential dependencies → NOT complex
- Large refactors, multi-file creation, testing multiple modules, batch operations → complex

${modelsInfo}

You can assign different models to subtasks based on their nature:
- Use larger/stronger models for complex coding tasks
- Use smaller/faster models for simple file operations or text generation
- Use null to use the default model
- IMPORTANT: You MUST use the EXACT full model name as it appears in the available models list above (including the tag after the colon). Do NOT abbreviate or truncate model names.

Respond with ONLY valid JSON, no markdown, no explanation:
{"complex": false}

OR if complex:
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

      // Parse the JSON response
      response = response.trim();
      // Strip markdown code fences if present
      if (response.startsWith('```')) {
        response = response.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      }

      let analysis: { complex: boolean; subtasks?: Array<{ task: string; model?: string | null }> };
      try {
        analysis = JSON.parse(response);
      } catch {
        return false; // Can't parse → fall through to normal execution
      }

      if (!analysis.complex || !analysis.subtasks?.length) {
        return false;
      }

      // Resolve partial model names to full IDs from available models
      if (availableModels.length > 0) {
        for (const sub of analysis.subtasks) {
          if (sub.model && sub.model !== 'null') {
            // Check if model is already a valid full name
            if (!availableModels.includes(sub.model)) {
              // Try to find a matching model (partial match)
              const match = availableModels.find(m => m.startsWith(sub.model + ':') || m === sub.model);
              if (match) {
                sub.model = match;
              } else {
                // No match found — fall back to default model
                sub.model = null;
              }
            }
          }
        }
      }

      // Orchestrate! Spawn subagents and wait for results
      const runId = randomUUID();
      const orchestrationStart = Date.now();

      // Persist orchestration run
      createOrchestrationRun(runId, sessionId, userMessage, analysis.subtasks.length);

      this.emit('chunk', `🔀 Tarefa complexa detectada — spawnando ${analysis.subtasks.length} subagentes... (run: ${runId.slice(0, 8)})\n\n`);

      const manager = getSubagentManager();

      // Pre-warm sessions to eliminate DB writes from spawn critical path
      manager.prewarm(analysis.subtasks.length);

      // Build subtask descriptors and spawn in parallel
      const subtaskDescriptors = analysis.subtasks.map(sub => ({
        task: sub.task,
        model: (sub.model && sub.model !== 'null') ? sub.model : undefined,
      }));

      // Register listeners BEFORE spawning so no events are missed.
      // taskLabels is populated after spawn returns the IDs, but the
      // handlers use a Set for filtering which is also filled post-spawn.
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

      // Track orchestration progress
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

      // Register ALL listeners BEFORE spawning so no events are missed
      manager.on('task:chunk', onSubagentChunk);
      manager.on('task:started', onSubagentStarted);
      manager.on('task:completed', onSubagentCompleted);
      manager.on('task:failed', onSubagentFailed);
      manager.on('task:started', onTaskStarted);
      manager.on('task:completed', onTaskCompleted);
      manager.on('task:failed', onTaskFailed);

      const taskIds = await manager.spawnMany(sessionId, subtaskDescriptors, runId);

      // Now populate the label map and filter set
      for (let i = 0; i < analysis.subtasks.length; i++) {
        const sub = analysis.subtasks[i];
        const label = sub.task.slice(0, 60).replace(/\n/g, ' ');
        taskLabels.set(taskIds[i], label);
        spawnedTaskIds.add(taskIds[i]);
        this.emit('chunk', `  → Subagente: ${sub.task.slice(0, 80)}${sub.model ? ` [${sub.model}]` : ''}\n`);
      }

      this.emit('chunk', `\n⏳ Aguardando ${taskIds.length} subagentes...\n`);

      // Emit initial progress now that IDs are known
      emitProgress();

      // Incremental result streaming: emit each sub-agent's result as it finishes
      const resultLines: string[] = [];
      const taskIdToIndex = new Map(taskIds.map((id, i) => [id, i]));
      let earlyCompleted = 0;
      let earlyFailed = 0;

      const results = await new Promise<import('./subagent.js').SubagentTask[]>((resolveAll) => {
        const seen = new Set<string>();

        const onEarlyResult = (taskId: string) => {
          if (!taskIds.includes(taskId)) return;
          if (seen.has(taskId)) return; // Deduplicate: event + manual scan
          seen.add(taskId);

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

        // Check if any already finished before we subscribed
        for (const id of taskIds) {
          const t = manager.getTask(id);
          if (t && (t.status === 'completed' || t.status === 'failed')) {
            onEarlyResult(id);
          }
        }
      });

      // Clean up listeners
      manager.off('task:started', onTaskStarted);
      manager.off('task:completed', onTaskCompleted);
      manager.off('task:failed', onTaskFailed);
      manager.off('task:chunk', onSubagentChunk);
      manager.off('task:started', onSubagentStarted);
      manager.off('task:completed', onSubagentCompleted);
      manager.off('task:failed', onSubagentFailed);

      // Complete orchestration run in DB
      const orchestrationDuration = Date.now() - orchestrationStart;
      const allDone = results.every(r => r.status === 'completed');
      completeOrchestrationRun(runId, allDone ? 'completed' : 'failed', orchestrationDuration);

      const completed = earlyCompleted;
      const failed = earlyFailed;

      this.emit('chunk', `\n✅ ${completed} completados, ${failed > 0 ? `❌ ${failed} falharam` : 'nenhuma falha'}\n\n`);

      // Conditional synthesis: only call LLM if there are failures requiring explanation
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
          // Synthesis failed — results were already streamed incrementally
        }
      }

      // Save the full orchestration output as assistant message
      const allResultsText = resultLines.filter(Boolean).join('\n\n---\n\n');
      const fullOutput = `🔀 ${analysis.subtasks.length} subagentes executados (${completed} ok, ${failed} falhas)\n\n${allResultsText}${synthesisText ? '\n\n' + synthesisText : ''}`;
      addMessage(sessionId, 'assistant', fullOutput);
      this.emit('done', fullOutput);
      this.maybeGenerateTitle(sessionId, model, userMessage, allResultsText.slice(0, 500));
      return true;
    } catch (err) {
      // Orchestration failed — fall through to normal execution
      return false;
    }
  }

  private async maybeGenerateTitle(sessionId: string, model: string, userMessage: string, assistantReply: string): Promise<void> {
    try {
      const session = getSession(sessionId);
      if (!session || session.title !== 'New Session') return;

      // Only on the first exchange (user + assistant = 2 messages, plus system)
      const count = getMessageCount(sessionId);
      if (count > 4) return;

      const provider = getProvider('ollama');
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: 'Generate a short title (max 6 words) for this conversation. Output ONLY the title, nothing else. No quotes, no punctuation at the end.',
        },
        {
          role: 'user',
          content: `User: ${userMessage}\nAssistant: ${assistantReply.slice(0, 300)}`,
        },
      ];

      let title = '';
      const stream = provider.chat({ model, messages });
      for await (const chunk of stream) {
        if (chunk.type === 'error') return;
        if (chunk.type === 'text' && chunk.text) {
          title += chunk.text;
        }
      }

      title = title.trim().replace(/^["']|["']$/g, '').slice(0, 80);
      if (title) {
        updateSessionTitle(sessionId, title);
        this.emit('title', title);
      }
    } catch {
      // Title generation is non-critical
    }
  }

  private async maybeCompact(sessionId: string, model: string): Promise<void> {
    const compactable = await getCompactableMessages(sessionId, model);
    if (!compactable) return;

    this.emit('compacting');

    try {
      const existingCompaction = getLatestCompaction(sessionId);

      // Deserialize existing compaction if structured
      let existingStructured: StructuredCompaction | null = null;
      if (existingCompaction) {
        existingStructured = deserializeCompaction(
          existingCompaction.summary,
          existingCompaction.format,
        );
      }

      // Perform structured compaction
      const structured = await performStructuredCompaction(
        compactable.messages,
        existingStructured,
        model,
      );

      const summary = serializeCompaction(structured);
      if (summary) {
        const startId = existingCompaction?.messages_end ?? 0;
        saveCompaction(sessionId, summary, startId, compactable.lastId, 'structured');
      }
    } catch {
      // Compaction is non-critical — don't break the agent loop
    }
  }

  private async performEmergencyCompaction(sessionId: string, model: string, keepCount: number): Promise<void> {
    const compactable = await getEmergencyCompactableMessages(sessionId, model, keepCount);
    if (!compactable) return;

    try {
      const existingCompaction = getLatestCompaction(sessionId);

      let existingStructured: StructuredCompaction | null = null;
      if (existingCompaction) {
        existingStructured = deserializeCompaction(
          existingCompaction.summary,
          existingCompaction.format,
        );
      }

      const structured = await performStructuredCompaction(
        compactable.messages,
        existingStructured,
        model,
      );

      const summary = serializeCompaction(structured);
      if (summary) {
        const startId = existingCompaction?.messages_end ?? 0;
        saveCompaction(sessionId, summary, startId, compactable.lastId, 'structured');
      }
    } catch {
      // Emergency compaction failed — continue anyway
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}

/**
 * Heuristic to detect if a local model's response indicates it needs tool access.
 * Detects 3 patterns:
 * 1. Explicit refusal ("não consigo acessar...")
 * 2. Simulated shell commands written as text (cat /etc/os-release)
 * 3. Intent to act without action ("vou verificar...", "let me check...")
 */
function needsToolCalling(text: string): boolean {
  const lower = text.toLowerCase();

  // Category 1: Explicit refusal
  const refusalIndicators = [
    'não consigo acessar', 'não tenho acesso', 'não posso executar',
    'não posso ler', 'não consigo ler', 'não consigo listar',
    'não tenho capacidade', 'não consigo verificar', 'não tenho como',
    'não posso acessar', 'sem acesso ao', 'sem acesso a ',
    'você pode executar', 'execute o comando', 'rode o comando',
    'tente rodar', 'você pode rodar', 'você pode usar o comando',
    'i cannot access', 'i cannot execute', 'i cannot read',
    'i don\'t have access', 'i can\'t access', 'i can\'t read',
    'i can\'t execute', 'i can\'t list', 'you can run',
    'try running', 'you could run',
  ];
  if (refusalIndicators.some(i => lower.includes(i))) return true;

  // Category 2: Model writes shell commands as text (simulating execution)
  const shellPatterns = [
    /^\s*(?:cat|ls|cd|grep|find|echo|pwd|whoami|uname|head|tail|wc|mkdir|rm|cp|mv|chmod|curl|wget|pip|npm|git|python|node|docker)\s+\S/m,
    /^\s*\$\s+\w+/m,
    /```(?:bash|sh|shell|terminal|console|zsh)\n/i,
  ];
  if (shellPatterns.some(p => p.test(text))) return true;

  // Category 3: Model expresses intent to act (but can't without tools)
  const intentIndicators = [
    'vou verificar', 'vou checar', 'deixa eu ver', 'deixe-me verificar',
    'vou executar', 'vou rodar', 'vou ler o arquivo', 'vou listar',
    'vou acessar', 'vou consultar', 'vou buscar',
    'let me check', 'let me verify', 'let me run', 'let me read',
    'let me look', 'let me see', 'i\'ll check', 'i\'ll run',
    'i\'ll read', 'i\'ll look',
  ];
  if (intentIndicators.some(i => lower.includes(i))) return true;

  return false;
}
