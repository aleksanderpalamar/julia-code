import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { ChatMessage, ToolCall, ChatChunk, TokenUsage } from '../providers/types.js';
import { getProvider } from '../providers/registry.js';
import { getToolSchemas, executeTool } from '../tools/registry.js';
import { buildContext, getCompactableMessages } from './context.js';
import { addMessage, saveCompaction, getLatestCompaction, addSessionTokens, getSession, updateSessionTitle, getMessageCount, createOrchestrationRun, completeOrchestrationRun } from '../session/manager.js';
import { getConfig } from '../config/index.js';
import { setCurrentSessionId } from '../tools/memory.js';
import { setSubagentSessionId } from '../tools/subagent.js';
import { getSubagentManager } from './subagent.js';
import { listOllamaModels } from '../providers/ollama.js';
import { wrapToolResult } from '../security/boundaries.js';
import { sanitizeToolResult } from '../security/sanitize.js';
import { getToolRisk, isBlockedCommand, matchesAllowRule, type AllowRule } from '../security/permissions.js';
import type { ApprovalResult } from '../tui/components/ApprovalPrompt.js';

export interface AgentEvents {
  thinking: [];
  chunk: [text: string];
  tool_call: [toolCall: ToolCall];
  tool_result: [name: string, result: string, success: boolean];
  approval_needed: [toolName: string, args: Record<string, unknown>, respond: (result: ApprovalResult) => void];
  compacting: [];
  usage: [usage: TokenUsage];
  title: [title: string];
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

  constructor(options?: AgentLoopOptions) {
    super();
    this.options = options ?? {};
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
    setCurrentSessionId(sessionId);
    setSubagentSessionId(sessionId);
    const config = getConfig();
    const activeModel = model ?? config.defaultModel;
    const provider = getProvider('ollama');
    let toolSchemas = getToolSchemas();
    if (this.options.excludeTools?.length) {
      toolSchemas = toolSchemas.filter(s => !this.options.excludeTools!.includes(s.function.name));
    }
    const maxIterations = this.options.maxIterations ?? config.maxToolIterations;

    try {
      // Save user message
      addMessage(sessionId, 'user', userMessage, undefined, undefined, images);

      // Auto-orchestrate: analyze complexity and spawn subagents if needed
      if (config.acpEnabled && config.acpAutoOrchestrate && !this.options.excludeTools?.includes('subagent')) {
        const orchestrated = await this.maybeOrchestrate(sessionId, userMessage, activeModel);
        if (orchestrated) {
          this.running = false;
          return;
        }
      }

      // Check if compaction is needed before this run
      await this.maybeCompact(sessionId, activeModel);

      let iterations = 0;

      while (iterations < maxIterations) {
        iterations++;
        this.emit('thinking');

        // Build context fresh each iteration
        const messages = buildContext(sessionId, { planMode: this.planMode, temperament: this.temperament });

        // Call LLM
        let fullText = '';
        const toolCalls: ToolCall[] = [];

        const stream = provider.chat({
          model: activeModel,
          messages,
          tools: toolSchemas,
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

        // Save assistant message
        addMessage(sessionId, 'assistant', fullText, toolCalls.length > 0 ? toolCalls : undefined);

        // If no tool calls, we're done
        if (toolCalls.length === 0) {
          this.emit('done', fullText);
          // Generate title in background after first exchange
          this.maybeGenerateTitle(sessionId, activeModel, userMessage, fullText);
          this.running = false;
          return;
        }

        // Execute tool calls and save results
        for (const tc of toolCalls) {
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

          // Truncate large tool results to avoid context overflow
          const MAX_RESULT_CHARS = 12000;
          if (resultText.length > MAX_RESULT_CHARS) {
            resultText = resultText.slice(0, MAX_RESULT_CHARS) + '\n... [truncated — use offset/limit for large files]';
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
      const taskIds: string[] = [];

      for (const sub of analysis.subtasks) {
        const subModel = (sub.model && sub.model !== 'null') ? sub.model : undefined;
        const id = await manager.spawn(sessionId, sub.task, runId, subModel);
        taskIds.push(id);
        this.emit('chunk', `  → Subagente: ${sub.task.slice(0, 80)}${sub.model ? ` [${sub.model}]` : ''}\n`);
      }

      this.emit('chunk', `\n⏳ Aguardando ${taskIds.length} subagentes...\n`);

      // Wait for all to complete
      const results = await manager.waitTasks(taskIds);

      // Complete orchestration run in DB
      const orchestrationDuration = Date.now() - orchestrationStart;
      const allDone = results.every(r => r.status === 'completed');
      completeOrchestrationRun(runId, allDone ? 'completed' : 'failed', orchestrationDuration);

      // Build a summary of results
      const resultLines: string[] = [];
      let allSuccess = true;
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const subDesc = analysis.subtasks[i]?.task.slice(0, 60) ?? `subtask ${i + 1}`;
        if (r.status === 'completed') {
          resultLines.push(`### Subtask ${i + 1}: ${subDesc}\n${r.result ?? '(no output)'}`);
        } else {
          allSuccess = false;
          resultLines.push(`### Subtask ${i + 1}: ${subDesc}\n❌ Failed: ${r.error ?? 'unknown error'}`);
        }
      }

      const completed = results.filter(r => r.status === 'completed').length;
      const failed = results.filter(r => r.status === 'failed').length;

      this.emit('chunk', `\n✅ ${completed} completados, ${failed > 0 ? `❌ ${failed} falharam` : 'nenhuma falha'}\n\n`);

      // Synthesize results — use a direct LLM call (not buildContext) to keep it lean
      let synthesisText = '';
      try {
        const synthesisMessages: ChatMessage[] = [
          {
            role: 'system',
            content: 'You are a helpful assistant. The user gave a task that was split into subtasks and executed in parallel by subagents. Synthesize the results into a clear, cohesive response. Mention what was done successfully and any failures. Be concise and direct. Respond in the same language the user used.',
          },
          {
            role: 'user',
            content: `Original request: "${userMessage}"\n\nSubagent results:\n\n${resultLines.join('\n\n---\n\n')}`,
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
            const total = chunk.usage.promptTokens + chunk.usage.completionTokens;
            addSessionTokens(sessionId, total);
            this.emit('usage', chunk.usage);
          }
          if (chunk.type === 'error') {
            // Synthesis LLM failed — fall through to raw output
            break;
          }
        }
      } catch {
        // Synthesis failed — we'll emit raw results below
      }

      // If synthesis produced nothing, emit the raw results directly
      if (!synthesisText.trim()) {
        synthesisText = `Resultados dos subagentes:\n\n${resultLines.join('\n\n---\n\n')}`;
        this.emit('chunk', synthesisText);
      }

      // Save the full orchestration output as assistant message
      const fullOutput = `🔀 ${analysis.subtasks.length} subagentes executados (${completed} ok, ${failed} falhas)\n\n${synthesisText}`;
      addMessage(sessionId, 'assistant', fullOutput);
      this.emit('done', fullOutput);
      this.maybeGenerateTitle(sessionId, model, userMessage, synthesisText);
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
    const compactable = getCompactableMessages(sessionId);
    if (!compactable) return;

    this.emit('compacting');

    try {
      const provider = getProvider('ollama');
      const existingCompaction = getLatestCompaction(sessionId);

      // Build summarization prompt
      const summaryMessages: ChatMessage[] = [
        {
          role: 'system',
          content: 'You are a summarizer. Condense the following conversation into a concise summary that preserves all key facts, decisions, file paths mentioned, tool results, and context needed to continue the conversation. Output ONLY the summary, no preamble.',
        },
      ];

      if (existingCompaction) {
        summaryMessages.push({
          role: 'user',
          content: `Previous summary:\n${existingCompaction.summary}\n\nNew messages to incorporate:`,
        });
      }

      // Add the messages to be compacted
      let conversationText = '';
      for (const msg of compactable.messages) {
        const prefix = msg.role.toUpperCase();
        conversationText += `[${prefix}]: ${msg.content}\n`;
        if (msg.tool_calls) {
          conversationText += `[TOOL_CALLS]: ${msg.tool_calls}\n`;
        }
      }

      summaryMessages.push({ role: 'user', content: conversationText });

      // Call LLM for summary
      let summary = '';
      const stream = provider.chat({ model, messages: summaryMessages });
      for await (const chunk of stream) {
        if (chunk.type === 'error') {
          // Compaction failed — non-critical, just skip
          return;
        }
        if (chunk.type === 'text' && chunk.text) {
          summary += chunk.text;
        }
      }

      if (summary.trim()) {
        const startId = existingCompaction?.messages_end ?? 0;
        saveCompaction(sessionId, summary.trim(), startId, compactable.lastId);
      }
    } catch {
      // Compaction is non-critical — don't break the agent loop
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}
