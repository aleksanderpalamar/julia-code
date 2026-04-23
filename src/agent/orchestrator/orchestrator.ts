import { randomUUID } from 'node:crypto';
import type { ChatMessage } from '../../providers/types.js';
import { getProvider } from '../../providers/registry.js';
import { addMessage, createOrchestrationRun, completeOrchestrationRun } from '../../session/manager.js';
import { listOllamaModels } from '../../providers/ollama.js';
import { log } from '../../observability/logger.js';
import { analyzeComplexity } from '../complexity.js';
import { getCachedPlannerResult, setCachedPlannerResult } from '../planner-cache.js';
import { getSubagentManager } from '../subagent.js';
import { buildSharedContextSnapshot } from '../compactor.js';
import { maybeGenerateTitle } from '../title-generator.js';
import type { SubagentTask } from '../subagent.js';
import type { OrchestrationDeps, OrchestrationEventSink, OrchestrationProgress } from './types.js';
import { synthesizeFailureReport } from './synthesis.js';

export type { OrchestrationDeps, OrchestrationEventSink, OrchestrationProgress };

export async function runOrchestration(deps: OrchestrationDeps): Promise<boolean> {
  const { sessionId, userMessage, model, emit } = deps;

  const plannerStart = Date.now();
  const taskPreview = userMessage.slice(0, 120).replace(/\n/g, ' ');

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

    emit.chunk(`🔀 Complex task detected - spawning ${analysis.subtasks.length} subagents... (run: ${runId.slice(0, 8)})\n\n`);

    const manager = getSubagentManager();

    manager.prewarm(analysis.subtasks.length);

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
      emit.subagentChunk(taskId, label, text);
    };
    const onSubagentStarted = (taskId: string) => {
      if (!spawnedTaskIds.has(taskId)) return;
      const label = taskLabels.get(taskId) ?? 'subagent';
      emit.subagentStatus(taskId, label, 'started');
    };
    const onSubagentCompleted = (taskId: string) => {
      if (!spawnedTaskIds.has(taskId)) return;
      const label = taskLabels.get(taskId) ?? 'subagent';
      const task = manager.getTask(taskId);
      emit.subagentStatus(taskId, label, 'completed', task?.durationMs);
    };
    const onSubagentFailed = (taskId: string) => {
      if (!spawnedTaskIds.has(taskId)) return;
      const label = taskLabels.get(taskId) ?? 'subagent';
      const task = manager.getTask(taskId);
      emit.subagentStatus(taskId, label, 'failed', task?.durationMs);
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
      emit.progress({
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
      emit.chunk(`🤖 → Subagent: ${sub.task.slice(0, 80)}${sub.model ? ` [${sub.model}]` : ''}\n`);
    }

    emit.chunk(`\n⏳ Waiting ${taskIds.length} subagents...\n`);

    emitProgress();

    const resultLines: string[] = [];
    const taskIdToIndex = new Map(taskIds.map((id, i) => [id, i]));
    let earlyCompleted = 0;
    let earlyFailed = 0;

    const results = await new Promise<SubagentTask[]>((resolveAll) => {
      const seen = new Set<string>();

      const onEarlyResult = (taskId: string) => {
        if (!taskIds.includes(taskId)) return;
        if (seen.has(taskId)) return;
        seen.add(taskId);

        const task = manager.getTask(taskId)!;
        const idx = taskIdToIndex.get(taskId)!;
        const subDesc = analysis.subtasks![idx]?.task.slice(0, 60) ?? `subtask ${idx + 1}`;

        if (task.status === 'completed') {
          earlyCompleted++;
          const line = `### Subtask ${idx + 1}: ${subDesc}\n${task.result ?? '(no output)'}`;
          resultLines[idx] = line;
          emit.chunk(`\n${line}\n`);
        } else {
          earlyFailed++;
          const line = `### Subtask ${idx + 1}: ${subDesc}\n❌ Failed: ${task.error ?? 'unknown error'}`;
          resultLines[idx] = line;
          emit.chunk(`\n${line}\n`);
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

    emit.chunk(`\n✅ ${completed} completed, ${failed > 0 ? `❌ ${failed} failed` : 'no flaws'}\n\n`);

    let synthesisText = '';
    if (failed > 0) {
      synthesisText = await synthesizeFailureReport({
        sessionId,
        userMessage,
        model,
        resultLines,
        emit,
      });
    }

    const allResultsText = resultLines.filter(Boolean).join('\n\n---\n\n');
    const fullOutput = `🔀 ${analysis.subtasks.length} executed subagents (${completed} ok, ${failed} failed)\n\n${allResultsText}${synthesisText ? '\n\n' + synthesisText : ''}`;
    addMessage(sessionId, 'assistant', fullOutput, undefined, undefined, undefined, model);
    emit.done(fullOutput);
    void maybeGenerateTitle(sessionId, model, userMessage, allResultsText.slice(0, 500)).then(title => {
      if (title) emit.title(title);
    });
    return true;
  } catch {
    return false;
  }
}
