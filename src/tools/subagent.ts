import { randomUUID } from 'node:crypto';
import type { ToolDefinition } from './types.js';
import { getSubagentManager } from '../agent/subagent.js';
import { listOrchestrationRuns, createOrchestrationRun, completeOrchestrationRun } from '../session/manager.js';

let currentSessionId: string | undefined;

export function setSubagentSessionId(id: string): void {
  currentSessionId = id;
}

export const subagentTool: ToolDefinition = {
  name: 'subagent',
  description: 'Spawn and manage subagents that run tasks in parallel. Each subagent is an independent agent with its own session and context. Actions: "spawn" creates one subagent, "spawn_many" creates multiple, "status" checks a task, "list" lists all tasks, "wait" waits for tasks to complete and returns results, "runs" lists orchestration run history, "cancel" cancels a specific task, "cancel_all" cancels all running/queued tasks.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['spawn', 'spawn_many', 'status', 'list', 'wait', 'runs', 'cancel', 'cancel_all'],
        description: 'Action to perform',
      },
      task: {
        type: 'string',
        description: 'Task description for the subagent (required for spawn)',
      },
      tasks: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of task descriptions (required for spawn_many)',
      },
      task_id: {
        type: 'string',
        description: 'Task ID to check (required for status)',
      },
      task_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Task IDs to wait for (optional for wait — waits all if omitted)',
      },
      model: {
        type: 'string',
        description: 'Model override for the subagent (optional)',
      },
    },
    required: ['action'],
  },

  async execute(args, _context?) {
    const action = args.action as string;
    const manager = getSubagentManager();

    if (!currentSessionId) {
      return { success: false, output: '', error: 'No active session for subagent orchestration' };
    }

    switch (action) {
      case 'spawn': {
        if (!args.task) {
          return { success: false, output: '', error: '"task" is required for spawn action' };
        }
        const task = String(args.task);
        const model = args.model ? String(args.model) : undefined;
        const runId = randomUUID();
        createOrchestrationRun(runId, currentSessionId, task, 1);
        const taskId = await manager.spawn(currentSessionId, task, runId, model);
        return { success: true, output: `Subagent spawned. Task ID: ${taskId}\nRun ID: ${runId}` };
      }

      case 'spawn_many': {
        const rawTasks = args.tasks as unknown[];
        if (!rawTasks || !Array.isArray(rawTasks) || rawTasks.length === 0) {
          return { success: false, output: '', error: '"tasks" array is required for spawn_many action' };
        }
        const tasks = rawTasks.map(t => String(t));
        const model = args.model ? String(args.model) : undefined;
        const runId = randomUUID();
        createOrchestrationRun(runId, currentSessionId, tasks.join('; ').slice(0, 200), tasks.length);
        const taskIds = await manager.spawnMany(currentSessionId, tasks, runId, model);
        return {
          success: true,
          output: `${taskIds.length} subagents spawned.\nRun ID: ${runId}\nTask IDs:\n${taskIds.map((id, i) => `  ${i + 1}. ${id}`).join('\n')}`,
        };
      }

      case 'status': {
        const taskId = args.task_id as string;
        if (!taskId) {
          return { success: false, output: '', error: '"task_id" is required for status action' };
        }
        const task = manager.getTask(taskId);
        if (!task) {
          return { success: false, output: '', error: `Task "${taskId}" not found` };
        }
        const lines = [
          `Task: ${task.id}`,
          `Run: ${task.runId}`,
          `Status: ${task.status}`,
          `Model: ${task.model ?? 'default'}`,
          `Session: ${task.sessionId}`,
          `Created: ${task.createdAt.toISOString()}`,
        ];
        if (task.startedAt) lines.push(`Started: ${task.startedAt.toISOString()}`);
        if (task.completedAt) lines.push(`Completed: ${task.completedAt.toISOString()}`);
        if (task.durationMs !== undefined) lines.push(`Duration: ${task.durationMs}ms`);
        if (task.result) lines.push(`Result:\n${task.result}`);
        if (task.error) lines.push(`Error: ${task.error}`);
        return { success: true, output: lines.join('\n') };
      }

      case 'list': {
        const tasks = manager.listTasks(currentSessionId);
        if (tasks.length === 0) {
          return { success: true, output: 'No subagent tasks for this session.' };
        }
        const lines = tasks.map(t => {
          const dur = t.durationMs !== undefined ? ` ${(t.durationMs / 1000).toFixed(1)}s` : '';
          const mod = t.model ? ` [${t.model}]` : '';
          return `[${t.status}${dur}] ${t.id} — ${t.task.slice(0, 80)}${mod}`;
        });
        return { success: true, output: `${tasks.length} tasks:\n${lines.join('\n')}` };
      }

      case 'wait': {
        const taskIds = args.task_ids as string[] | undefined;
        let results;
        if (taskIds && taskIds.length > 0) {
          results = await manager.waitTasks(taskIds);
        } else {
          results = await manager.waitAll(currentSessionId);
        }

        if (results.length === 0) {
          return { success: true, output: 'No tasks to wait for.' };
        }

        const lines = results.map(t => {
          const header = `[${t.status}] Task ${t.id}`;
          if (t.status === 'completed') {
            return `${header}\nResult:\n${t.result ?? '(no output)'}`;
          } else if (t.status === 'failed') {
            return `${header}\nError: ${t.error ?? 'unknown error'}`;
          }
          return header;
        });

        const completed = results.filter(t => t.status === 'completed').length;
        const failed = results.filter(t => t.status === 'failed').length;

        return {
          success: true,
          output: `All ${results.length} tasks finished (${completed} completed, ${failed} failed).\n\n${lines.join('\n\n---\n\n')}`,
        };
      }

      case 'runs': {
        const runs = listOrchestrationRuns(currentSessionId);
        if (runs.length === 0) {
          return { success: true, output: 'No orchestration runs for this session.' };
        }
        const lines = runs.map(r => {
          const dur = r.duration_ms !== null ? `${(r.duration_ms / 1000).toFixed(1)}s` : 'in progress';
          const preview = r.user_task.slice(0, 60).replace(/\n/g, ' ');
          return `Run ${r.id.slice(0, 8)} — "${preview}" (${r.subtask_count} subtasks, ${r.status}, ${dur})`;
        });
        return { success: true, output: `${runs.length} orchestration runs:\n${lines.join('\n')}` };
      }

      case 'cancel': {
        const taskId = args.task_id as string;
        if (!taskId) {
          return { success: false, output: '', error: '"task_id" is required for cancel action' };
        }
        const cancelled = manager.cancelTask(taskId);
        if (cancelled) {
          return { success: true, output: `Task ${taskId} cancelled.` };
        }
        return { success: false, output: '', error: `Task "${taskId}" not found or already finished.` };
      }

      case 'cancel_all': {
        const count = manager.cancelAll(currentSessionId);
        return { success: true, output: `${count} task(s) cancelled.` };
      }

      default:
        return { success: false, output: '', error: `Unknown action: ${action}. Use "spawn", "spawn_many", "status", "list", "wait", "runs", "cancel", or "cancel_all".` };
    }
  },
};
