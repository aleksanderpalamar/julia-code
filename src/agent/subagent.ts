import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { AgentLoop } from './loop.js';
import { createSession, createSubagentRun, updateSubagentRunStatus } from '../session/manager.js';
import { getConfig } from '../config/index.js';

export interface SubagentTask {
  id: string;
  runId: string;
  parentSessionId: string;
  sessionId: string;
  task: string;
  model?: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
}

export interface SubagentEvents {
  'task:queued': [taskId: string, label: string];
  'task:started': [taskId: string, label: string];
  'task:completed': [taskId: string, result: string];
  'task:failed': [taskId: string, error: string];
  'task:chunk': [taskId: string, text: string];
}

type QueuedItem = {
  task: SubagentTask;
  model?: string;
};

class SubagentManager extends EventEmitter<SubagentEvents> {
  private tasks = new Map<string, SubagentTask>();
  private agents = new Map<string, AgentLoop>();
  private running = 0;
  private queue: QueuedItem[] = [];
  private sessionPool: string[] = [];

  constructor() {
    super();
  }

  prewarm(count: number): void {
    for (let i = 0; i < count; i++) {
      const session = createSession('subagent: (prewarmed)');
      this.sessionPool.push(session.id);
    }
  }

  private getOrCreateSession(label: string): string {
    if (this.sessionPool.length > 0) {
      return this.sessionPool.pop()!;
    }
    return createSession(label).id;
  }

  async spawn(parentSessionId: string, taskDescription: string | unknown, runId: string, model?: string): Promise<string> {
    const config = getConfig();
    const taskId = randomUUID();
    const desc = String(taskDescription ?? '');
    const preview = desc.slice(0, 60).replace(/\n/g, ' ');
    const sessionId = this.getOrCreateSession(`subagent: ${preview}`);
    const resolvedModel = model ?? config.acpDefaultModel ?? config.defaultModel;

    const task: SubagentTask = {
      id: taskId,
      runId,
      parentSessionId,
      sessionId,
      task: desc,
      model: resolvedModel,
      status: 'queued',
      createdAt: new Date(),
    };

    this.tasks.set(taskId, task);

    createSubagentRun(taskId, runId, sessionId, desc, resolvedModel);

    this.emit('task:queued', taskId, preview);

    const maxConcurrent = config.acpMaxConcurrent;
    if (this.running < maxConcurrent) {
      this.runTask(task, resolvedModel);
    } else {
      this.queue.push({ task, model: resolvedModel });
    }

    return taskId;
  }

  async spawnMany(
    parentSessionId: string,
    tasks: Array<string | { task: string; model?: string }>,
    runId: string,
    model?: string,
  ): Promise<string[]> {
    return Promise.all(
      tasks.map(t => {
        if (typeof t === 'string') {
          return this.spawn(parentSessionId, t, runId, model);
        }
        return this.spawn(parentSessionId, t.task, runId, t.model ?? model);
      })
    );
  }

  getTask(taskId: string): SubagentTask | undefined {
    return this.tasks.get(taskId);
  }

  listTasks(parentSessionId: string): SubagentTask[] {
    return Array.from(this.tasks.values())
      .filter(t => t.parentSessionId === parentSessionId);
  }

  async waitAll(parentSessionId: string): Promise<SubagentTask[]> {
    const tasks = this.listTasks(parentSessionId);
    const pendingIds = tasks
      .filter(t => t.status === 'queued' || t.status === 'running')
      .map(t => t.id);

    if (pendingIds.length === 0) return tasks;

    await this.waitTasks(pendingIds);
    return this.listTasks(parentSessionId);
  }

  async waitTasks(taskIds: string[]): Promise<SubagentTask[]> {
    const pending = new Set(taskIds.filter(id => {
      const t = this.tasks.get(id);
      return !t || t.status === 'queued' || t.status === 'running';
    }));

    if (pending.size === 0) {
      return taskIds.map(id => this.tasks.get(id)!);
    }

    return new Promise((resolve) => {
      const onDone = (taskId: string) => {
        pending.delete(taskId);
        if (pending.size === 0) {
          this.off('task:completed', onDone);
          this.off('task:failed', onDone);
          resolve(taskIds.map(id => this.tasks.get(id)!));
        }
      };
      this.on('task:completed', onDone);
      this.on('task:failed', onDone);
    });
  }

  private runTask(task: SubagentTask, model?: string): void {
    const label = task.task.slice(0, 60).replace(/\n/g, ' ');
    task.status = 'running';
    task.startedAt = new Date();
    this.running++;

    updateSubagentRunStatus(task.id, 'running', { startedAt: task.startedAt.toISOString() });

    this.emit('task:started', task.id, label);

    const config = getConfig();
    const agent = new AgentLoop({
      maxIterations: config.acpSubagentMaxIterations,
      excludeTools: ['subagent'], // Prevent recursive subagent spawning
    });
    this.agents.set(task.id, agent);

    let resultText = '';

    agent.on('chunk', (text) => {
      resultText += text;
      this.emit('task:chunk', task.id, text);
    });

    agent.on('done', (fullText) => {
      if (task.status === 'completed' || task.status === 'failed') return;
      const result = fullText || resultText;
      task.status = 'completed';
      task.result = result;
      task.completedAt = new Date();
      task.durationMs = task.startedAt ? task.completedAt.getTime() - task.startedAt.getTime() : undefined;
      updateSubagentRunStatus(task.id, 'completed', {
        completedAt: task.completedAt.toISOString(),
        durationMs: task.durationMs,
        result: task.result,
      });
      this.agents.delete(task.id);
      this.running--;
      this.emit('task:completed', task.id, result);
      this.drainQueue();
    });

    agent.on('error', (error) => {
      if (task.status === 'completed' || task.status === 'failed') return;
      task.status = 'failed';
      task.error = error;
      task.completedAt = new Date();
      task.durationMs = task.startedAt ? task.completedAt.getTime() - task.startedAt.getTime() : undefined;
      updateSubagentRunStatus(task.id, 'failed', {
        completedAt: task.completedAt.toISOString(),
        durationMs: task.durationMs,
        error: task.error,
      });
      this.agents.delete(task.id);
      this.running--;
      this.emit('task:failed', task.id, error);
      this.drainQueue();
    });

    agent.run(task.sessionId, task.task, model).catch((err) => {
      if (task.status === 'completed' || task.status === 'failed') return;
      const errorMsg = err instanceof Error ? err.message : String(err);
      task.status = 'failed';
      task.error = errorMsg;
      task.completedAt = new Date();
      task.durationMs = task.startedAt ? task.completedAt.getTime() - task.startedAt.getTime() : undefined;
      updateSubagentRunStatus(task.id, 'failed', {
        completedAt: task.completedAt.toISOString(),
        durationMs: task.durationMs,
        error: task.error,
      });
      this.agents.delete(task.id);
      this.running--;
      this.emit('task:failed', task.id, errorMsg);
      this.drainQueue();
    });
  }

  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status === 'completed' || task.status === 'failed') return false;

    const agent = this.agents.get(taskId);
    if (agent) {
      agent.abort();
      this.agents.delete(taskId);
      this.running--;
    }

    const queueIdx = this.queue.findIndex(item => item.task.id === taskId);
    if (queueIdx >= 0) {
      this.queue.splice(queueIdx, 1);
    }

    task.status = 'failed';
    task.error = 'Cancelled';
    task.completedAt = new Date();
    task.durationMs = task.startedAt ? task.completedAt.getTime() - task.startedAt.getTime() : undefined;
    updateSubagentRunStatus(task.id, 'failed', {
      completedAt: task.completedAt.toISOString(),
      durationMs: task.durationMs,
      error: 'Cancelled',
    });
    this.emit('task:failed', task.id, 'Cancelled');
    this.drainQueue();
    return true;
  }

  cancelAll(parentSessionId: string): number {
    let cancelled = 0;
    for (const [taskId, task] of this.tasks) {
      if (task.parentSessionId === parentSessionId && (task.status === 'running' || task.status === 'queued')) {
        if (this.cancelTask(taskId)) cancelled++;
      }
    }
    return cancelled;
  }

  private drainQueue(): void {
    const maxConcurrent = getConfig().acpMaxConcurrent;
    while (this.running < maxConcurrent && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.runTask(item.task, item.model);
    }
  }
}

let _manager: SubagentManager | null = null;

export function getSubagentManager(): SubagentManager {
  if (!_manager) {
    _manager = new SubagentManager();
  }
  return _manager;
}
