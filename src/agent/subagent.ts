import { randomUUID } from 'node:crypto';
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

type QueuedItem = {
  task: SubagentTask;
  model?: string;
  resolve: (taskId: string) => void;
};

class SubagentManager {
  private tasks = new Map<string, SubagentTask>();
  private running = 0;
  private maxConcurrent: number;
  private queue: QueuedItem[] = [];

  constructor() {
    this.maxConcurrent = getConfig().acpMaxConcurrent;
  }

  async spawn(parentSessionId: string, taskDescription: string | unknown, runId: string, model?: string): Promise<string> {
    const config = getConfig();
    const taskId = randomUUID();
    const desc = String(taskDescription ?? '');
    const preview = desc.slice(0, 60).replace(/\n/g, ' ');
    const session = createSession(`subagent: ${preview}`);
    const resolvedModel = model ?? config.acpDefaultModel ?? config.defaultModel;

    const task: SubagentTask = {
      id: taskId,
      runId,
      parentSessionId,
      sessionId: session.id,
      task: desc,
      model: resolvedModel,
      status: 'queued',
      createdAt: new Date(),
    };

    this.tasks.set(taskId, task);

    // Persist to DB
    createSubagentRun(taskId, runId, session.id, desc, resolvedModel);

    if (this.running < this.maxConcurrent) {
      this.runTask(task, resolvedModel);
    } else {
      // Queue it — will be started when a slot opens
      return new Promise<string>((resolve) => {
        this.queue.push({ task, model: resolvedModel, resolve });
        resolve(taskId); // Return task ID immediately, task stays queued
      });
    }

    return taskId;
  }

  async spawnMany(parentSessionId: string, tasks: string[], runId: string, model?: string): Promise<string[]> {
    const ids: string[] = [];
    for (const t of tasks) {
      const id = await this.spawn(parentSessionId, t, runId, model);
      ids.push(id);
    }
    return ids;
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
    const pending = tasks.filter(t => t.status === 'queued' || t.status === 'running');

    if (pending.length === 0) return tasks;

    // Poll until all are done
    return new Promise((resolve) => {
      const check = () => {
        const allDone = pending.every(t => {
          const current = this.tasks.get(t.id);
          return current && (current.status === 'completed' || current.status === 'failed');
        });
        if (allDone) {
          resolve(this.listTasks(parentSessionId));
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    });
  }

  async waitTasks(taskIds: string[]): Promise<SubagentTask[]> {
    return new Promise((resolve) => {
      const check = () => {
        const allDone = taskIds.every(id => {
          const t = this.tasks.get(id);
          return t && (t.status === 'completed' || t.status === 'failed');
        });
        if (allDone) {
          resolve(taskIds.map(id => this.tasks.get(id)!));
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    });
  }

  private runTask(task: SubagentTask, model?: string): void {
    task.status = 'running';
    task.startedAt = new Date();
    this.running++;

    // Persist running status
    updateSubagentRunStatus(task.id, 'running', { startedAt: task.startedAt.toISOString() });

    const config = getConfig();
    const agent = new AgentLoop({
      maxIterations: config.acpSubagentMaxIterations,
      excludeTools: ['subagent'], // Prevent recursive subagent spawning
    });

    let resultText = '';

    agent.on('chunk', (text) => {
      resultText += text;
    });

    agent.on('done', (fullText) => {
      task.status = 'completed';
      task.result = fullText || resultText;
      task.completedAt = new Date();
      task.durationMs = task.startedAt ? task.completedAt.getTime() - task.startedAt.getTime() : undefined;
      updateSubagentRunStatus(task.id, 'completed', {
        completedAt: task.completedAt.toISOString(),
        durationMs: task.durationMs,
        result: task.result,
      });
      this.running--;
      this.drainQueue();
    });

    agent.on('error', (error) => {
      task.status = 'failed';
      task.error = error;
      task.completedAt = new Date();
      task.durationMs = task.startedAt ? task.completedAt.getTime() - task.startedAt.getTime() : undefined;
      updateSubagentRunStatus(task.id, 'failed', {
        completedAt: task.completedAt.toISOString(),
        durationMs: task.durationMs,
        error: task.error,
      });
      this.running--;
      this.drainQueue();
    });

    // Fire and forget — events handle completion
    agent.run(task.sessionId, task.task, model).catch((err) => {
      task.status = 'failed';
      task.error = err instanceof Error ? err.message : String(err);
      task.completedAt = new Date();
      task.durationMs = task.startedAt ? task.completedAt.getTime() - task.startedAt.getTime() : undefined;
      updateSubagentRunStatus(task.id, 'failed', {
        completedAt: task.completedAt.toISOString(),
        durationMs: task.durationMs,
        error: task.error,
      });
      this.running--;
      this.drainQueue();
    });
  }

  private drainQueue(): void {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.runTask(item.task, item.model);
    }
  }
}

// Singleton
let _manager: SubagentManager | null = null;

export function getSubagentManager(): SubagentManager {
  if (!_manager) {
    _manager = new SubagentManager();
  }
  return _manager;
}
