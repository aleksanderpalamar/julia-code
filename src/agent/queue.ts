import { AgentLoop } from './loop.js';

interface QueueItem {
  sessionId: string;
  message: string;
  model?: string;
  resolve: () => void;
  reject: (err: Error) => void;
}

/**
 * Serializes agent runs per session so only one runs at a time.
 */
export class AgentQueue {
  private queues = new Map<string, QueueItem[]>();
  private running = new Set<string>();
  private agent: AgentLoop;

  constructor(agent: AgentLoop) {
    this.agent = agent;
  }

  enqueue(sessionId: string, message: string, model?: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const item: QueueItem = { sessionId, message, model, resolve, reject };

      if (!this.queues.has(sessionId)) {
        this.queues.set(sessionId, []);
      }
      this.queues.get(sessionId)!.push(item);

      this.processNext(sessionId);
    });
  }

  private async processNext(sessionId: string): Promise<void> {
    if (this.running.has(sessionId)) return;

    const queue = this.queues.get(sessionId);
    if (!queue?.length) return;

    const item = queue.shift()!;
    this.running.add(sessionId);

    try {
      await this.agent.run(item.sessionId, item.message, item.model);
      item.resolve();
    } catch (err) {
      item.reject(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.running.delete(sessionId);
      this.processNext(sessionId);
    }
  }

  getAgent(): AgentLoop {
    return this.agent;
  }
}
