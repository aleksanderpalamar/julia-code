import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { log, resetLoggerStateForTests, getObservabilityLogPath } from '../src/observability/logger.js';
import { computeLoopMetrics, computeToolMetrics } from '../src/observability/metrics.js';

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
    log.plannerDecision({
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
    log.toolCall({ sessionId: 's1', iteration: 2, name: 'read', success: true, durationMs: 42 });
    log.retry({ sessionId: 's1', iteration: 3, kind: 'stream' });
    log.loopEnd({ sessionId: 's1', iterations: 5, reason: 'done' });

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
      log.toolCall({ sessionId: 's1', iteration: 1, name: 'x', success: true, durationMs: 1 });
    }).not.toThrow();

    await flushLogger();
  });

  it('honors JULIA_LOG_DIR override', () => {
    expect(getObservabilityLogPath()).toBe(join(logDir, 'events.jsonl'));
  });

  it('does not create the log file until the first event', async () => {
    expect(existsSync(join(logDir, 'events.jsonl'))).toBe(false);
    log.loopEnd({ sessionId: 's1', iterations: 1, reason: 'done' });
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
    log.loopEnd({ sessionId: 's1', iterations: 3, reason: 'done' });
    log.loopEnd({ sessionId: 's2', iterations: 7, reason: 'done' });
    log.loopEnd({ sessionId: 's3', iterations: 25, reason: 'max_iterations' });
    log.retry({ sessionId: 's1', iteration: 2, kind: 'stream' });
    log.retry({ sessionId: 's2', iteration: 4, kind: 'empty' });

    await flushLogger();

    const metrics = await computeLoopMetrics();
    expect(metrics.totalLoops).toBe(3);
    expect(metrics.maxIterations).toBe(25);
    expect(metrics.reasons.done).toBe(2);
    expect(metrics.reasons.max_iterations).toBe(1);
    expect(metrics.retriesByKind.stream).toBe(1);
    expect(metrics.retriesByKind.empty).toBe(1);
    expect(metrics.iterationHistogram['3']).toBe(1);
    expect(metrics.iterationHistogram['7']).toBe(1);
    expect(metrics.iterationHistogram['25']).toBe(1);
  });

  it('computes tool metrics per tool name', async () => {
    log.toolCall({ sessionId: 's1', iteration: 1, name: 'read', success: true, durationMs: 10 });
    log.toolCall({ sessionId: 's1', iteration: 2, name: 'read', success: true, durationMs: 30 });
    log.toolCall({ sessionId: 's1', iteration: 3, name: 'read', success: false, durationMs: 5 });
    log.toolCall({ sessionId: 's1', iteration: 4, name: 'edit', success: true, durationMs: 100 });

    await flushLogger();

    const metrics = await computeToolMetrics();
    expect(metrics.totalCalls).toBe(4);
    expect(metrics.perTool.read.calls).toBe(3);
    expect(metrics.perTool.read.failures).toBe(1);
    expect(metrics.perTool.read.avgDurationMs).toBe(15);
    expect(metrics.perTool.edit.calls).toBe(1);
    expect(metrics.perTool.edit.avgDurationMs).toBe(100);
  });

  it('handles absent log file gracefully', async () => {
    const metrics = await computeLoopMetrics();
    expect(metrics.totalLoops).toBe(0);
    expect(metrics.avgIterations).toBeNull();
    expect(metrics.maxIterations).toBeNull();
  });
});
