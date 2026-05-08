import type { EventEmitter } from 'node:events';
import type { ApprovalResult } from '../../tui/components/ApprovalPrompt.js';
import type { AgentEvents } from './events.js';

export function requestApproval(input: {
  toolName: string;
  args: Record<string, unknown>;
  emitter: EventEmitter<AgentEvents>;
}): Promise<ApprovalResult> {
  return new Promise<ApprovalResult>((resolve) => {
    if (input.emitter.listenerCount('approval_needed') === 0) {
      resolve('approve');
      return;
    }
    input.emitter.emit('approval_needed', input.toolName, input.args, (result: ApprovalResult) => {
      resolve(result);
    });
  });
}

export class SessionApprovalState {
  private approvedAll = false;

  createIterationRef(): { current: boolean } {
    return { current: this.approvedAll };
  }

  syncFromRef(ref: { current: boolean }): void {
    this.approvedAll = ref.current;
  }
}
