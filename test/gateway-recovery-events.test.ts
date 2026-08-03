import { describe, expect, it } from 'vitest';
import { AgentLoop } from '../src/agent/loop.js';
import { attachGatewayRecoveryEvents } from '../src/gateway/server.js';

describe('gateway recovery event contract', () => {
  it('forwards clear-streaming and warning events with stable payloads', () => {
    const agent = new AgentLoop();
    const events: Array<{ type: string; data: unknown }> = [];
    const detach = attachGatewayRecoveryEvents(
      agent,
      (type, data) => events.push({ type, data }),
    );

    agent.emit('clear_streaming');
    agent.emit('warning', 'model did not call a tool');

    expect(events).toEqual([
      { type: 'clear_streaming', data: {} },
      { type: 'warning', data: { message: 'model did not call a tool' } },
    ]);

    detach();
    agent.emit('warning', 'ignored after detach');
    expect(events).toHaveLength(2);
  });
});
