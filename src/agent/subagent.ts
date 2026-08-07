import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { AgentLoop } from './loop.js';
import { createSession, createSubagentRun, updateSubagentRunStatus } from '../session/manager.js';
import { getConfig } from '../config/index.js';
import { recordEvent } from '../observability/logger.js';
import { ConcurrencyController } from './subagent/concurrency.js';
import { TaskQueue } from './subagent/queue.js';
import { runTask } from './subagent/executor.js';
import type { SubagentTask, SubagentEvents } from './subagent/types.js';

export type { SubagentTask, SubagentEvents } from './subagent/types.js';

export class SubagentManager extends EventEmitter<SubagentEvents> {
  private tasks = new Map<string, SubagentTask>();
  private agents = new Map<string, AgentLoop>();
  private sessionPool: string[] = [];
  private concurrency = new ConcurrencyController();
  private queue = new TaskQueue();

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

  async spawn(
    parentSessionId: string,
    taskDescription: string | unknown,
    runId: string,
    model?: string,
    sharedContext?: string,
  ): Promise<string> {
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
      sharedContext,
      model: resolvedModel,
      status: 'queued',
      createdAt: new Date(),
    };

    this.tasks.set(taskId, task);

    createSubagentRun(taskId, runId, sessionId, desc, resolvedModel);

    this.emit('task:queued', taskId, preview);

    if (this.concurrency.canRun(resolvedModel)) {
      this.launchTask(task, resolvedModel);
    } else {
      this.queue.enqueue(resolvedModel, { task, model: resolvedModel });
    }

    return taskId;
  }

  async spawnMany(
    parentSessionId: string,
    tasks: Array<string | { task: string; model?: string; sharedContext?: string }>,
    runId: string,
    model?: string,
    sharedContext?: string,
  ): Promise<string[]> {
    return Promise.all(
      tasks.map(t => {
        if (typeof t === 'string') {
          return this.spawn(parentSessionId, t, runId, model, sharedContext);
        }
        return this.spawn(
          parentSessionId,
          t.task,
          runId,
          t.model ?? model,
          t.sharedContext ?? sharedContext,
        );
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

  private launchTask(task: SubagentTask, model: string | undefined): void {
    runTask({
      task,
      model,
      agents: this.agents,
      concurrency: this.concurrency,
      emitter: this,
      drainQueue: () => this.drainQueue(),
    });
  }

  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status === 'completed' || task.status === 'failed') return false;

    const modelKey = task.model ?? '__unknown__';
    const agent = this.agents.get(taskId);
    if (agent) {
      agent.abort();
      this.agents.delete(taskId);
      this.concurrency.release(modelKey);
    }

    this.queue.removeTask(taskId);

    task.status = 'failed';
    task.error = 'Cancelled';
    task.completedAt = new Date();
    task.durationMs = task.startedAt ? task.completedAt.getTime() - task.startedAt.getTime() : undefined;
    updateSubagentRunStatus(task.id, 'failed', {
      completedAt: task.completedAt.toISOString(),
      durationMs: task.durationMs,
      error: 'Cancelled',
    });
    recordEvent('subagent_done', {
      runId: task.runId,
      taskId: task.id,
      status: 'failed',
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
    this.queue.drain({
      canRun: (m) => this.concurrency.canRun(m),
      isAtGlobalLimit: () => this.concurrency.isAtGlobalLimit(),
      run: (item) => this.launchTask(item.task, item.model),
    });
  }
}

let _manager: SubagentManager | null = null;

export function getSubagentManager(): SubagentManager {
  if (!_manager) {
    _manager = new SubagentManager();
  }
  return _manager;
}
