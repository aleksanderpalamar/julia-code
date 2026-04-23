import { randomUUID } from 'node:crypto';
import { addMessage, createOrchestrationRun, completeOrchestrationRun } from '../../session/manager.js';
import { getSubagentManager } from '../subagent.js';
import { buildSharedContextSnapshot } from '../compactor.js';
import { maybeGenerateTitle } from '../title-generator.js';
import type { SubagentTask } from '../subagent.js';
import type { OrchestrationDeps, OrchestrationEventSink, OrchestrationProgress } from './types.js';
import { synthesizeFailureReport } from './synthesis.js';
import { planSubtasks } from './planner.js';

export type { OrchestrationDeps, OrchestrationEventSink, OrchestrationProgress };

export async function runOrchestration(deps: OrchestrationDeps): Promise<boolean> {
  const { sessionId, userMessage, model, emit } = deps;

  const plan = await planSubtasks({ sessionId, userMessage, model });
  if (plan.kind === 'simple') return false;

  const { subtasks } = plan;

  try {
    const runId = randomUUID();
    const orchestrationStart = Date.now();

    createOrchestrationRun(runId, sessionId, userMessage, subtasks.length);

    emit.chunk(`🔀 Complex task detected - spawning ${subtasks.length} subagents... (run: ${runId.slice(0, 8)})\n\n`);

    const manager = getSubagentManager();

    manager.prewarm(subtasks.length);

    const sharedContext = buildSharedContextSnapshot(sessionId);

    const subtaskDescriptors = subtasks.map(sub => ({
      task: sub.task,
      model: sub.model,
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

    const total = subtasks.length;
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

    for (let i = 0; i < subtasks.length; i++) {
      const sub = subtasks[i];
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
        const subDesc = subtasks[idx]?.task.slice(0, 60) ?? `subtask ${idx + 1}`;

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
    const fullOutput = `🔀 ${subtasks.length} executed subagents (${completed} ok, ${failed} failed)\n\n${allResultsText}${synthesisText ? '\n\n' + synthesisText : ''}`;
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
