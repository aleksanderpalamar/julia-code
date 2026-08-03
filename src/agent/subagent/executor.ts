import { EventEmitter } from 'node:events';
import { AgentLoop } from '../loop.js';
import { updateSubagentRunStatus } from '../../session/manager.js';
import { getConfig } from '../../config/index.js';
import { toolContextStorage } from '../../tools/registry.js';
import { log } from '../../observability/logger.js';
import type { ConcurrencyController } from './concurrency.js';
import { setupIsolation, finalizeWorktree, teardownWorktree } from './isolation.js';
import type { SubagentTask, SubagentEvents } from './types.js';

interface RunTaskDeps {
  task: SubagentTask;
  model: string | undefined;
  agents: Map<string, AgentLoop>;
  concurrency: ConcurrencyController;
  emitter: EventEmitter<SubagentEvents>;
  drainQueue: () => void;
}

interface FinalizeOpts {
  task: SubagentTask;
  modelKey: string;
  agents: Map<string, AgentLoop>;
  concurrency: ConcurrencyController;
  emitter: EventEmitter<SubagentEvents>;
  drainQueue: () => void;
  status: 'completed' | 'failed';
  result?: string;
  error?: string;
}

function finalizeTask(opts: FinalizeOpts): void {
  const { task, modelKey, agents, concurrency, emitter, drainQueue, status, result, error } = opts;
  task.status = status;
  if (result !== undefined) task.result = result;
  if (error !== undefined) task.error = error;
  task.completedAt = new Date();
  task.durationMs = task.startedAt
    ? task.completedAt.getTime() - task.startedAt.getTime()
    : undefined;

  updateSubagentRunStatus(task.id, status, {
    completedAt: task.completedAt.toISOString(),
    durationMs: task.durationMs,
    ...(status === 'completed' ? { result } : { error }),
  });

  log.subagentDone({
    runId: task.runId,
    taskId: task.id,
    status,
    durationMs: task.durationMs,
    ...(error ? { error } : {}),
  });

  agents.delete(task.id);
  concurrency.release(modelKey);

  if (status === 'completed') emitter.emit('task:completed', task.id, result ?? '');
  else emitter.emit('task:failed', task.id, error ?? '');

  drainQueue();
}

export function runTask(deps: RunTaskDeps): void {
  const { task, model, agents, concurrency, emitter, drainQueue } = deps;
  const label = task.task.slice(0, 60).replace(/\n/g, ' ');
  const modelKey = model ?? task.model ?? '__unknown__';

  task.status = 'running';
  task.startedAt = new Date();
  concurrency.acquire(modelKey);

  updateSubagentRunStatus(task.id, 'running', {
    startedAt: task.startedAt.toISOString(),
  });

  log.subagentSpawn({
    runId: task.runId,
    taskId: task.id,
    model,
    taskPreview: label,
  });

  emitter.emit('task:started', task.id, label);

  const config = getConfig();
  const agent = new AgentLoop({
    maxIterations: config.acpSubagentMaxIterations,
    excludeTools: ['subagent'],
    isSubagent: true,
  });
  agents.set(task.id, agent);

  const isolation = setupIsolation(task.id);

  let resultText = '';
  let terminalWarning: string | undefined;

  agent.on('chunk', (text) => {
    resultText += text;
    emitter.emit('task:chunk', task.id, text);
  });

  agent.on('clear_streaming', () => {
    resultText = '';
    emitter.emit('task:clear', task.id);
  });

  agent.on('warning', (message) => {
    terminalWarning = message;
    emitter.emit('task:warning', task.id, message);
  });

  agent.on('done', async (fullText) => {
    if (task.status === 'completed' || task.status === 'failed') return;
    if (terminalWarning) {
      teardownWorktree(isolation.worktree);
      finalizeTask({
        task,
        modelKey,
        agents,
        concurrency,
        emitter,
        drainQueue,
        status: 'failed',
        error: terminalWarning,
      });
      return;
    }
    const mergeInfo = await finalizeWorktree(isolation.worktree);
    const result = (fullText || resultText) + mergeInfo;
    finalizeTask({
      task,
      modelKey,
      agents,
      concurrency,
      emitter,
      drainQueue,
      status: 'completed',
      result,
    });
  });

  agent.on('error', (error) => {
    if (task.status === 'completed' || task.status === 'failed') return;
    teardownWorktree(isolation.worktree);
    finalizeTask({
      task,
      modelKey,
      agents,
      concurrency,
      emitter,
      drainQueue,
      status: 'failed',
      error,
    });
  });

  const enrichedTask = task.sharedContext
    ? `<parent_context>\n${task.sharedContext}\n</parent_context>\n\n${task.task}`
    : task.task;

  toolContextStorage.run(isolation.toolContext, () => {
    agent.run(task.sessionId, enrichedTask, model).catch((err) => {
      if (task.status === 'completed' || task.status === 'failed') return;
      teardownWorktree(isolation.worktree);
      const errorMsg = err instanceof Error ? err.message : String(err);
      finalizeTask({
        task,
        modelKey,
        agents,
        concurrency,
        emitter,
        drainQueue,
        status: 'failed',
        error: errorMsg,
      });
    });
  });
}
