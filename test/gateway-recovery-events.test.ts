import { describe, expect, it } from 'vitest';
import { AgentLoop } from '../src/agent/loop.js';
import {
  attachGatewayRecoveryEvents,
  attachGatewayTerminalEvents,
  buildGatewayChatResult,
  type GatewayTerminalState,
} from '../src/gateway/server.js';

describe('gateway recovery event contract', () => {
  it('forwards parent and task-scoped recovery events with stable payloads', () => {
    const agent = new AgentLoop();
    const events: Array<{ type: string; data: unknown }> = [];
    const detach = attachGatewayRecoveryEvents(
      agent,
      (type, data) => events.push({ type, data }),
    );

    agent.emit('clear_streaming');
    agent.emit('warning', 'model did not call a tool');
    agent.emit('subagent_clear', 'task-1', 'inspect files');
    agent.emit('subagent_warning', 'task-1', 'inspect files', 'subagent recovery failed');

    expect(events).toEqual([
      { type: 'clear_streaming', data: {} },
      { type: 'warning', data: { message: 'model did not call a tool' } },
      { type: 'subagent_clear', data: { task_id: 'task-1', label: 'inspect files' } },
      {
        type: 'subagent_warning',
        data: { task_id: 'task-1', label: 'inspect files', message: 'subagent recovery failed' },
      },
    ]);

    detach();
    agent.emit('warning', 'ignored after detach');
    expect(events).toHaveLength(4);
  });
});

describe('gateway JSON terminal result', () => {
  it('uses the done event as the response instead of a persisted draft', () => {
    const agent = new AgentLoop();
    const terminal: GatewayTerminalState = {};
    const events: Array<{ type: string; data: unknown }> = [];
    const detach = attachGatewayTerminalEvents(
      agent,
      terminal,
      (type, data) => events.push({ type, data }),
    );

    agent.emit('done', 'recovered response');

    expect(buildGatewayChatResult('s1', terminal, events)).toEqual({
      status: 200,
      body: {
        session_id: 's1',
        response: 'recovered response',
        events: [{ type: 'done', data: { text: 'recovered response' } }],
      },
    });
    detach();
  });

  it('returns a failure when recovery emits error even if a draft exists elsewhere', () => {
    const agent = new AgentLoop();
    const terminal: GatewayTerminalState = {};
    const events: Array<{ type: string; data: unknown }> = [];
    const detach = attachGatewayTerminalEvents(
      agent,
      terminal,
      (type, data) => events.push({ type, data }),
    );

    agent.emit('error', 'recovery failed');
    agent.emit('done', '');

    const result = buildGatewayChatResult('s1', terminal, events);
    expect(result.status).toBe(500);
    expect(result.body).toMatchObject({ session_id: 's1', error: 'recovery failed' });
    expect(result.body).not.toHaveProperty('response');
    detach();
  });

  it('does not treat a non-terminal diagnostic error as a failed response', () => {
    const agent = new AgentLoop();
    const terminal: GatewayTerminalState = {};
    const events: Array<{ type: string; data: unknown }> = [];
    const detach = attachGatewayTerminalEvents(
      agent,
      terminal,
      (type, data) => events.push({ type, data }),
    );

    agent.emit('error', 'one repository mention could not be resolved');
    agent.emit('done', 'answer without that mention');

    expect(buildGatewayChatResult('s1', terminal, events)).toMatchObject({
      status: 200,
      body: { response: 'answer without that mention' },
    });
    detach();
  });
});
