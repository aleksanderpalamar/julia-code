import type { QueuedItem } from './types.js';

export class TaskQueue {
  private queuesByModel = new Map<string, QueuedItem[]>();

  enqueue(model: string, item: QueuedItem): void {
    const q = this.queuesByModel.get(model) ?? [];
    q.push(item);
    this.queuesByModel.set(model, q);
  }

  removeTask(taskId: string): boolean {
    for (const [k, q] of this.queuesByModel) {
      const idx = q.findIndex(item => item.task.id === taskId);
      if (idx >= 0) {
        q.splice(idx, 1);
        if (q.length === 0) this.queuesByModel.delete(k);
        return true;
      }
    }
    return false;
  }

  drain(input: {
    canRun: (model: string) => boolean;
    isAtGlobalLimit: () => boolean;
    run: (item: QueuedItem) => void;
  }): void {
    const { canRun, isAtGlobalLimit, run } = input;
    for (const [model, queue] of this.queuesByModel) {
      while (queue.length > 0 && canRun(model)) {
        const item = queue.shift()!;
        run(item);
      }
      if (queue.length === 0) this.queuesByModel.delete(model);
      if (isAtGlobalLimit()) break;
    }
  }
}
