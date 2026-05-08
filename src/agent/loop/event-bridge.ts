import type { EventEmitter } from 'node:events';
import type { IterationEventSink } from '../iteration.js';
import type { OrchestrationEventSink } from '../orchestrator/index.js';
import type { AgentEvents } from './events.js';

export function createIterationSink(
  emitter: EventEmitter<AgentEvents>,
): IterationEventSink {
  return {
    thinking: () => emitter.emit('thinking'),
    chunk: (text) => emitter.emit('chunk', text),
    toolCall: (tc) => emitter.emit('tool_call', tc),
    toolResult: (name, text, success) => emitter.emit('tool_result', name, text, success),
    compacting: () => emitter.emit('compacting'),
    contextHealth: (health) => emitter.emit('context_health', health),
    usage: (usage) => emitter.emit('usage', usage),
    clearStreaming: () => emitter.emit('clear_streaming'),
    modelSwitch: (m) => emitter.emit('model_switch', m),
  };
}

export function createOrchestrationSink(
  emitter: EventEmitter<AgentEvents>,
): OrchestrationEventSink {
  return {
    chunk: (text) => emitter.emit('chunk', text),
    usage: (usage) => emitter.emit('usage', usage),
    done: (fullText) => emitter.emit('done', fullText),
    title: (title) => emitter.emit('title', title),
    subagentChunk: (taskId, label, text) => emitter.emit('subagent_chunk', taskId, label, text),
    subagentStatus: (taskId, label, status, durationMs) =>
      emitter.emit('subagent_status', taskId, label, status, durationMs),
    progress: (progress) => emitter.emit('orchestration_progress', progress),
  };
}
