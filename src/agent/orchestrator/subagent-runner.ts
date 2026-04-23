import { getSubagentManager, type SubagentManager } from '../subagent.js';
import type { OrchestrationEventSink, PlannedSubtask } from './types.js';

type SubagentEmit = Pick<OrchestrationEventSink, 'chunk' | 'subagentChunk' | 'subagentStatus' | 'progress'>;

export interface SubagentExecutionDeps {
  sessionId: string;
  runId: string;
  subtasks: PlannedSubtask[];
  sharedContext: string | undefined;
  emit: SubagentEmit;
}

export interface SubagentExecutionResult {
  resultLines: string[];
  completed: number;
  failed: number;
  allDone: boolean;
}

interface TrackedSubagents {
  spawnedTaskIds: Set<string>;
  taskLabels: Map<string, string>;
}

export async function executeSubagents(deps: SubagentExecutionDeps): Promise<SubagentExecutionResult> {
  const { sessionId, runId, subtasks, sharedContext, emit } = deps;
  const manager = getSubagentManager();

  manager.prewarm(subtasks.length);

  const tracked: TrackedSubagents = {
    spawnedTaskIds: new Set(),
    taskLabels: new Map(),
  };

  const stopPassThrough = bindPassThroughListeners(manager, tracked, emit);
  const progress = buildProgressEmitter(manager, runId, subtasks.length, tracked, emit);

  const descriptors = subtasks.map(sub => ({
    task: sub.task,
    model: sub.model,
    sharedContext,
  }));
  const taskIds = await manager.spawnMany(sessionId, descriptors, runId);

  registerSpawnedIds(taskIds, subtasks, tracked, emit);

  emit.chunk(`\n⏳ Waiting ${taskIds.length} subagents...\n`);
  progress.emit();

  const outcome = await collectResults(manager, taskIds, subtasks, emit);

  progress.cleanup();
  stopPassThrough();

  return outcome;
}

function registerSpawnedIds(
  taskIds: string[],
  subtasks: PlannedSubtask[],
  tracked: TrackedSubagents,
  emit: Pick<SubagentEmit, 'chunk'>,
): void {
  for (let i = 0; i < subtasks.length; i++) {
    const sub = subtasks[i];
    const label = sub.task.slice(0, 60).replace(/\n/g, ' ');
    tracked.taskLabels.set(taskIds[i], label);
    tracked.spawnedTaskIds.add(taskIds[i]);
    emit.chunk(`🤖 → Subagent: ${sub.task.slice(0, 80)}${sub.model ? ` [${sub.model}]` : ''}\n`);
  }
}

function bindPassThroughListeners(
  manager: SubagentManager,
  tracked: TrackedSubagents,
  emit: SubagentEmit,
): () => void {
  const resolveLabel = (taskId: string): string => tracked.taskLabels.get(taskId) ?? 'subagent';
  const isTracked = (taskId: string): boolean => tracked.spawnedTaskIds.has(taskId);

  const onChunk = (taskId: string, text: string) => {
    if (!isTracked(taskId)) return;
    emit.subagentChunk(taskId, resolveLabel(taskId), text);
  };
  const onStarted = (taskId: string) => {
    if (!isTracked(taskId)) return;
    emit.subagentStatus(taskId, resolveLabel(taskId), 'started');
  };
  const onCompleted = (taskId: string) => {
    if (!isTracked(taskId)) return;
    emit.subagentStatus(taskId, resolveLabel(taskId), 'completed', manager.getTask(taskId)?.durationMs);
  };
  const onFailed = (taskId: string) => {
    if (!isTracked(taskId)) return;
    emit.subagentStatus(taskId, resolveLabel(taskId), 'failed', manager.getTask(taskId)?.durationMs);
  };

  manager.on('task:chunk', onChunk);
  manager.on('task:started', onStarted);
  manager.on('task:completed', onCompleted);
  manager.on('task:failed', onFailed);

  return () => {
    manager.off('task:chunk', onChunk);
    manager.off('task:started', onStarted);
    manager.off('task:completed', onCompleted);
    manager.off('task:failed', onFailed);
  };
}

interface ProgressHandles {
  emit: () => void;
  cleanup: () => void;
}

function buildProgressEmitter(
  manager: SubagentManager,
  runId: string,
  total: number,
  tracked: TrackedSubagents,
  emit: Pick<SubagentEmit, 'progress'>,
): ProgressHandles {
  let completed = 0;
  let failed = 0;

  const emitProgress = () => {
    const ids = Array.from(tracked.spawnedTaskIds);
    const running = ids.filter(id => manager.getTask(id)?.status === 'running').length;
    const queued = ids.filter(id => manager.getTask(id)?.status === 'queued').length;
    emit.progress({ runId, total, completed, failed, running, queued });
  };

  const isTracked = (taskId: string): boolean => tracked.spawnedTaskIds.has(taskId);

  const onStarted = (taskId: string) => {
    if (!isTracked(taskId)) return;
    emitProgress();
  };
  const onCompleted = (taskId: string) => {
    if (!isTracked(taskId)) return;
    completed++;
    emitProgress();
  };
  const onFailed = (taskId: string) => {
    if (!isTracked(taskId)) return;
    failed++;
    emitProgress();
  };

  manager.on('task:started', onStarted);
  manager.on('task:completed', onCompleted);
  manager.on('task:failed', onFailed);

  return {
    emit: emitProgress,
    cleanup: () => {
      manager.off('task:started', onStarted);
      manager.off('task:completed', onCompleted);
      manager.off('task:failed', onFailed);
    },
  };
}

function collectResults(
  manager: SubagentManager,
  taskIds: string[],
  subtasks: PlannedSubtask[],
  emit: Pick<SubagentEmit, 'chunk'>,
): Promise<SubagentExecutionResult> {
  const resultLines: string[] = [];
  const taskIdToIndex = new Map(taskIds.map((id, i) => [id, i]));
  const seen = new Set<string>();
  let completed = 0;
  let failed = 0;

  return new Promise<SubagentExecutionResult>(resolve => {
    const recordResult = (taskId: string) => {
      if (!taskIdToIndex.has(taskId) || seen.has(taskId)) return;
      seen.add(taskId);

      const task = manager.getTask(taskId)!;
      const idx = taskIdToIndex.get(taskId)!;
      const subDesc = subtasks[idx]?.task.slice(0, 60) ?? `subtask ${idx + 1}`;

      if (task.status === 'completed') {
        completed++;
        resultLines[idx] = `### Subtask ${idx + 1}: ${subDesc}\n${task.result ?? '(no output)'}`;
      } else {
        failed++;
        resultLines[idx] = `### Subtask ${idx + 1}: ${subDesc}\n❌ Failed: ${task.error ?? 'unknown error'}`;
      }

      emit.chunk(`\n${resultLines[idx]}\n`);

      if (seen.size === taskIds.length) {
        manager.off('task:completed', recordResult);
        manager.off('task:failed', recordResult);
        resolve({
          resultLines,
          completed,
          failed,
          allDone: failed === 0,
        });
      }
    };

    manager.on('task:completed', recordResult);
    manager.on('task:failed', recordResult);

    for (const id of taskIds) {
      const status = manager.getTask(id)?.status;
      if (status === 'completed' || status === 'failed') {
        recordResult(id);
      }
    }
  });
}
