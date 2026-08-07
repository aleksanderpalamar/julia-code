import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { recordEvent, resetLoggerStateForTests, getObservabilityLogPath, flushObservability } from '../src/observability/logger.js';
import { loadEvents, computeLoopMetrics, computeToolMetrics } from '../src/observability/metrics/index.js';

let logDir: string;

async function flushLogger(): Promise<void> {
  // The logger is fire-and-forget; wait for the microtask queue to drain.
  await new Promise(resolve => setTimeout(resolve, 50));
}

describe('observability/logger', () => {
  beforeEach(() => {
    logDir = mkdtempSync(join(tmpdir(), 'juliacode-obs-'));
    process.env.JULIA_LOG_DIR = logDir;
    resetLoggerStateForTests();
  });

  afterEach(() => {
    delete process.env.JULIA_LOG_DIR;
    rmSync(logDir, { recursive: true, force: true });
  });

  it('writes planner decision events to JSONL', async () => {
    recordEvent('planner_decision', {
      turnId: 't1',
      sessionId: 's1',
      complex: true,
      subtaskCount: 3,
      via: 'llm',
      durationMs: 1200,
      taskPreview: 'refatore src/',
    });

    await flushLogger();

    const content = readFileSync(getObservabilityLogPath(), 'utf-8').trim();
    const event = JSON.parse(content);
    expect(event.type).toBe('planner_decision');
    expect(event.complex).toBe(true);
    expect(event.subtaskCount).toBe(3);
    expect(event.via).toBe('llm');
    expect(event.durationMs).toBe(1200);
    expect(event.sessionId).toBe('s1');
    expect(event.ts).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('writes tool_call, retry, and loop_end events', async () => {
    recordEvent('tool_call', { turnId: 't1', sessionId: 's1', iteration: 2, name: 'read', success: true, durationMs: 42 });
    recordEvent('retry', { turnId: 't1', sessionId: 's1', iteration: 3, kind: 'stream' });
    recordEvent('loop_end', { turnId: 't1', sessionId: 's1', iterations: 5, reason: 'done' });

    await flushLogger();

    const lines = readFileSync(getObservabilityLogPath(), 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l));

    expect(lines).toHaveLength(3);
    expect(lines[0].type).toBe('tool_call');
    expect(lines[1].type).toBe('retry');
    expect(lines[2].type).toBe('loop_end');
  });

  it('never throws when the log dir is unwritable', async () => {
    // Point to a path the process cannot create (e.g. nested inside a file).
    process.env.JULIA_LOG_DIR = '/dev/null/nope';
    resetLoggerStateForTests();

    expect(() => {
      recordEvent('tool_call', { turnId: 't1', sessionId: 's1', iteration: 1, name: 'x', success: true, durationMs: 1 });
    }).not.toThrow();

    await flushLogger();
  });

  it('honors JULIA_LOG_DIR override', () => {
    expect(getObservabilityLogPath()).toBe(join(logDir, 'events.jsonl'));
  });

  it('does not create the log file until the first event', async () => {
    expect(existsSync(join(logDir, 'events.jsonl'))).toBe(false);
    recordEvent('loop_end', { turnId: 't1', sessionId: 's1', iterations: 1, reason: 'done' });
    await flushLogger();
    expect(existsSync(join(logDir, 'events.jsonl'))).toBe(true);
  });
});

describe('observability/metrics (JSONL)', () => {
  beforeEach(() => {
    logDir = mkdtempSync(join(tmpdir(), 'juliacode-obs-'));
    process.env.JULIA_LOG_DIR = logDir;
    resetLoggerStateForTests();
  });

  afterEach(() => {
    delete process.env.JULIA_LOG_DIR;
    rmSync(logDir, { recursive: true, force: true });
  });

  it('computes loop metrics from logged events', async () => {
    recordEvent('loop_end', { turnId: 't1', sessionId: 's1', iterations: 3, reason: 'done' });
    recordEvent('loop_end', { turnId: 't1', sessionId: 's2', iterations: 7, reason: 'done' });
    recordEvent('loop_end', { turnId: 't1', sessionId: 's3', iterations: 25, reason: 'max_iterations' });
    recordEvent('retry', { turnId: 't1', sessionId: 's1', iteration: 2, kind: 'stream' });
    recordEvent('retry', { turnId: 't1', sessionId: 's2', iteration: 4, kind: 'empty' });
    recordEvent('retry', { turnId: 't1', sessionId: 's3', iteration: 24, kind: 'intent-nudge' });

    await flushLogger();

    const metrics = computeLoopMetrics(await loadEvents());
    expect(metrics.totalLoops).toBe(3);
    expect(metrics.maxIterations).toBe(25);
    expect(metrics.reasons.done).toBe(2);
    expect(metrics.reasons.max_iterations).toBe(1);
    expect(metrics.retriesByKind.stream).toBe(1);
    expect(metrics.retriesByKind.empty).toBe(1);
    expect(metrics.retriesByKind['intent-nudge']).toBe(1);
    expect(metrics.iterationHistogram['3']).toBe(1);
    expect(metrics.iterationHistogram['7']).toBe(1);
    expect(metrics.iterationHistogram['25']).toBe(1);
  });

  it('computes tool metrics per tool name', async () => {
    recordEvent('tool_call', { turnId: 't1', sessionId: 's1', iteration: 1, name: 'read', success: true, durationMs: 10 });
    recordEvent('tool_call', { turnId: 't1', sessionId: 's1', iteration: 2, name: 'read', success: true, durationMs: 30 });
    recordEvent('tool_call', { turnId: 't1', sessionId: 's1', iteration: 3, name: 'read', success: false, durationMs: 5 });
    recordEvent('tool_call', { turnId: 't1', sessionId: 's1', iteration: 4, name: 'edit', success: true, durationMs: 100 });

    await flushLogger();

    const metrics = computeToolMetrics(await loadEvents());
    expect(metrics.totalCalls).toBe(4);
    expect(metrics.perTool.read.calls).toBe(3);
    expect(metrics.perTool.read.failures).toBe(1);
    expect(metrics.perTool.read.avgDurationMs).toBe(15);
    expect(metrics.perTool.edit.calls).toBe(1);
    expect(metrics.perTool.edit.avgDurationMs).toBe(100);
  });

  it('handles absent log file gracefully', async () => {
    const metrics = computeLoopMetrics(await loadEvents());
    expect(metrics.totalLoops).toBe(0);
    expect(metrics.avgIterations).toBeNull();
    expect(metrics.maxIterations).toBeNull();
  });
});

describe('observability/logger — turn-scoped events', () => {
  beforeEach(() => {
    logDir = mkdtempSync(join(tmpdir(), 'juliacode-obs-turn-'));
    process.env.JULIA_LOG_DIR = logDir;
    resetLoggerStateForTests();
  });

  afterEach(() => {
    delete process.env.JULIA_LOG_DIR;
    rmSync(logDir, { recursive: true, force: true });
  });

  function readLines(): Array<Record<string, unknown>> {
    return readFileSync(getObservabilityLogPath(), 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l));
  }

  it('writes llm_call with the pass, model, tokens and tool-call count', async () => {
    recordEvent('llm_call', {
      turnId: 't1', sessionId: 's1', iteration: 1, model: 'qwen3:8b', pass: 'main',
      durationMs: 1200, promptTokens: 900, completionTokens: 120, toolCallCount: 2,
    });

    await flushObservability();

    const [event] = readLines();
    expect(event).toMatchObject({
      type: 'llm_call', turnId: 't1', model: 'qwen3:8b', pass: 'main',
      promptTokens: 900, completionTokens: 120, toolCallCount: 2,
    });
  });

  it('writes gate_decision with the outcome and the deciding rule', async () => {
    recordEvent('gate_decision', {
      turnId: 't1', sessionId: 's1', iteration: 2,
      toolName: 'exec', outcome: 'rate_limited', via: 'quota',
    });

    await flushObservability();

    expect(readLines()[0]).toMatchObject({
      type: 'gate_decision', toolName: 'exec', outcome: 'rate_limited', via: 'quota',
    });
  });

  it('writes compaction with the token reduction', async () => {
    recordEvent('compaction', {
      turnId: 't1', sessionId: 's1', kind: 'emergency',
      messagesCompacted: 12, tokensBefore: 8000, tokensAfter: 600, durationMs: 900,
    });

    await flushObservability();

    expect(readLines()[0]).toMatchObject({
      type: 'compaction', kind: 'emergency', tokensBefore: 8000, tokensAfter: 600,
    });
  });

  it('writes memory_retrieval including the unavailable-provider case', async () => {
    recordEvent('memory_retrieval', {
      turnId: 't1', sessionId: 's1', candidates: 0, returned: 0,
      topScore: null, durationMs: 3, providerAvailable: false,
    });

    await flushObservability();

    expect(readLines()[0]).toMatchObject({
      type: 'memory_retrieval', providerAvailable: false, topScore: null,
    });
  });

  it('stamps one turnId across every event of a turn and separates two turns', async () => {
    recordEvent('llm_call', {
      turnId: 'turn-a', sessionId: 's1', iteration: 1, model: 'm', pass: 'main',
      durationMs: 1, promptTokens: 1, completionTokens: 1, toolCallCount: 0,
    });
    recordEvent('tool_call', { turnId: 'turn-a', sessionId: 's1', iteration: 1, name: 'read', success: true, durationMs: 1 });
    recordEvent('loop_end', { turnId: 'turn-a', sessionId: 's1', iterations: 1, reason: 'done' });
    recordEvent('loop_end', { turnId: 'turn-b', sessionId: 's1', iterations: 2, reason: 'done' });

    await flushObservability();

    const lines = readLines();
    expect(lines.filter(l => l.turnId === 'turn-a')).toHaveLength(3);
    expect(lines.filter(l => l.turnId === 'turn-b')).toHaveLength(1);
  });

  it('writes events in emission order so a trace reads sequentially', async () => {
    for (let i = 0; i < 25; i++) {
      recordEvent('tool_call', {
        turnId: 't1', sessionId: 's1', iteration: i, name: `tool-${i}`, success: true, durationMs: 1,
      });
    }

    await flushObservability();

    const names = readLines().map(l => l.name);
    expect(names).toEqual(Array.from({ length: 25 }, (_, i) => `tool-${i}`));
  });
});

describe('observability/logger — write chain resilience', () => {
  beforeEach(() => {
    logDir = mkdtempSync(join(tmpdir(), 'juliacode-obs-chain-'));
    process.env.JULIA_LOG_DIR = logDir;
    resetLoggerStateForTests();
  });

  afterEach(() => {
    delete process.env.JULIA_LOG_DIR;
    rmSync(logDir, { recursive: true, force: true });
  });

  it('keeps logging after an unwritable stretch instead of stalling the chain', async () => {
    process.env.JULIA_LOG_DIR = '/dev/null/nope';
    resetLoggerStateForTests();
    recordEvent('loop_end', { turnId: 't1', sessionId: 's1', iterations: 1, reason: 'error' });
    await flushObservability();

    process.env.JULIA_LOG_DIR = logDir;
    resetLoggerStateForTests();
    recordEvent('loop_end', { turnId: 't2', sessionId: 's1', iterations: 2, reason: 'done' });
    await flushObservability();

    const lines = readFileSync(getObservabilityLogPath(), 'utf-8')
      .split('\n').filter(Boolean).map(l => JSON.parse(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ turnId: 't2', reason: 'done' });
  });
});
