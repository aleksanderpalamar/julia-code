import { writeEvent } from './event-sink.js';
import type {
  EventPayload,
  ObservabilityEvent,
  ObservabilityEventType,
} from './events.js';

export function recordEvent<T extends ObservabilityEventType>(
  type: T,
  payload: EventPayload<T>,
): void {
  writeEvent({ type, ts: new Date().toISOString(), ...payload } as ObservabilityEvent);
}

export {
  getObservabilityLogPath,
  flushObservability,
  resetLoggerStateForTests,
} from './event-sink.js';

export type {
  ObservabilityEvent,
  ObservabilityEventType,
  EventPayload,
  EventOf,
  PlannerVia,
  LLMPass,
  GateOutcomeKind,
  GateVia,
  RetryKind,
  LoopEndReason,
  CompactionKind,
  SubagentStatus,
} from './events.js';
