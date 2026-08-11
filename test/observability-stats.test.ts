import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  recordEvent,
  resetLoggerStateForTests,
} from '../src/observability/logger.js';
import {
  loadEvents,
  computePlannerMetrics,
  formatMetricsForDisplay,
  computeLoopMetrics,
  computeToolMetrics,
  computeDiagnosticsMetrics,
  computeLLMMetrics,
  computeGateMetrics,
  computeCompactionMetrics,
  computeMemoryRetrievalMetrics,
  type AllMetrics,
} from '../src/observability/metrics/index.js';

let logDir: string;

async function flushLogger(): Promise<void> {
  await new Promise(r => setTimeout(r, 50));
}

function shellOrchestrationAndSubagents(): {
  orchestration: AllMetrics['orchestration'];
  subagents: AllMetrics['subagents'];
} {
  return {
    orchestration: {
      totalRuns: 0,
      completedRuns: 0,
      failedRuns: 0,
      successRate: 0,
      avgDurationMs: null,
      avgSubtaskCount: null,
    },
    subagents: {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      failureRate: 0,
      avgDurationMs: null,
      perModel: {},
    },
  };
}

describe('computePlannerMetrics', () => {
  beforeEach(() => {
    logDir = mkdtempSync(join(tmpdir(), 'juliacode-stats-'));
    process.env.JULIA_LOG_DIR = logDir;
    resetLoggerStateForTests();
  });

  afterEach(() => {
    delete process.env.JULIA_LOG_DIR;
    rmSync(logDir, { recursive: true, force: true });
  });

  it('returns zeroed metrics when the log file does not exist', async () => {
    const m = computePlannerMetrics(await loadEvents());
    expect(m.total).toBe(0);
    expect(m.byVia.heuristic).toBe(0);
    expect(m.byVia.llm).toBe(0);
    expect(m.byVia.cache).toBe(0);
    expect(m.cacheHitRate).toBeNull();
  });

  it('groups decisions by via', async () => {
    recordEvent('planner_decision', { turnId: 't1', sessionId: 's1', complex: false, subtaskCount: 0, via: 'heuristic', durationMs: 1, taskPreview: 'hi' });
    recordEvent('planner_decision', { turnId: 't1', sessionId: 's1', complex: true, subtaskCount: 3, via: 'llm', durationMs: 500, taskPreview: 'refatore' });
    recordEvent('planner_decision', { turnId: 't1', sessionId: 's1', complex: true, subtaskCount: 3, via: 'cache', durationMs: 2, taskPreview: 'refatore' });
    recordEvent('planner_decision', { turnId: 't1', sessionId: 's1', complex: true, subtaskCount: 3, via: 'cache', durationMs: 1, taskPreview: 'refatore' });

    await flushLogger();

    const m = computePlannerMetrics(await loadEvents());
    expect(m.total).toBe(4);
    expect(m.byVia.heuristic).toBe(1);
    expect(m.byVia.llm).toBe(1);
    expect(m.byVia.cache).toBe(2);
    expect(m.cacheHitRate).toBeCloseTo(2 / 3);
  });

});

describe('formatMetricsForDisplay', () => {
  beforeEach(() => {
    logDir = mkdtempSync(join(tmpdir(), 'juliacode-stats-'));
    process.env.JULIA_LOG_DIR = logDir;
    resetLoggerStateForTests();
  });

  afterEach(() => {
    delete process.env.JULIA_LOG_DIR;
    rmSync(logDir, { recursive: true, force: true });
  });

  it('produces a human-readable report with all sections', async () => {
    recordEvent('planner_decision', { turnId: 't1', sessionId: 's1', complex: true, subtaskCount: 3, via: 'llm', durationMs: 500, taskPreview: 'x' });
    recordEvent('planner_decision', { turnId: 't1', sessionId: 's1', complex: true, subtaskCount: 3, via: 'cache', durationMs: 2, taskPreview: 'x' });
    recordEvent('tool_call', { turnId: 't1', sessionId: 's1', iteration: 1, name: 'read', success: true, durationMs: 10 });
    recordEvent('loop_end', { turnId: 't1', sessionId: 's1', iterations: 5, reason: 'done' });

    await flushLogger();

    const shell = shellOrchestrationAndSubagents();
    const events = await loadEvents();
    const planner = computePlannerMetrics(events);
    const loops = computeLoopMetrics(events);
    const tools = computeToolMetrics(events);
    const diagnostics = computeDiagnosticsMetrics(events);
    const llm = computeLLMMetrics(events);
    const gate = computeGateMetrics(events);
    const compaction = computeCompactionMetrics(events);
    const memory = computeMemoryRetrievalMetrics(events);

    const report = formatMetricsForDisplay({
      ...shell, planner, loops, tools, diagnostics, llm, gate, compaction, memory,
    });

    expect(report).toContain('Julia observability stats');
    expect(report).toContain('Planner');
    expect(report).toContain('via llm           1');
    expect(report).toContain('via cache         1');
    expect(report).toContain('cache hit-rate    50%');
    expect(report).toContain('Loops');
    expect(report).toContain('Top tools');
    expect(report).toContain('read');
    expect(report).not.toContain('DAG candidates');
  });
});

describe('new metric aggregates', () => {
  beforeEach(() => {
    logDir = mkdtempSync(join(tmpdir(), 'juliacode-stats-new-'));
    process.env.JULIA_LOG_DIR = logDir;
    resetLoggerStateForTests();
  });

  afterEach(() => {
    delete process.env.JULIA_LOG_DIR;
    rmSync(logDir, { recursive: true, force: true });
  });

  it('aggregates llm calls by pass, model and token totals', async () => {
    recordEvent('llm_call', {
      turnId: 't1', sessionId: 's1', iteration: 1, model: 'qwen3:8b', pass: 'main',
      durationMs: 1000, promptTokens: 500, completionTokens: 100, toolCallCount: 1,
    });
    recordEvent('llm_call', {
      turnId: 't1', sessionId: 's1', iteration: 2, model: 'qwen3:8b', pass: 'correction',
      durationMs: 200, promptTokens: 80, completionTokens: 20, toolCallCount: 1,
    });
    recordEvent('llm_call', {
      turnId: 't1', sessionId: 's1', iteration: 2, model: 'gpt-oss', pass: 'synthesis',
      durationMs: 600, promptTokens: 300, completionTokens: 200, toolCallCount: 0,
    });

    await flushLogger();
    const m = computeLLMMetrics(await loadEvents());

    expect(m.totalCalls).toBe(3);
    expect(m.byPass).toEqual({ main: 1, synthesis: 1, correction: 1 });
    expect(m.promptTokens).toBe(880);
    expect(m.completionTokens).toBe(320);
    expect(m.perModel['qwen3:8b']).toEqual({ calls: 2, avgDurationMs: 600, tokens: 700 });
  });

  it('aggregates gate decisions by outcome and deciding rule', async () => {
    recordEvent('gate_decision', { turnId: 't1', sessionId: 's1', iteration: 1, toolName: 'read', outcome: 'allowed', via: 'risk' });
    recordEvent('gate_decision', { turnId: 't1', sessionId: 's1', iteration: 1, toolName: 'exec', outcome: 'rate_limited', via: 'quota' });
    recordEvent('gate_decision', { turnId: 't1', sessionId: 's1', iteration: 2, toolName: 'exec', outcome: 'blocked', via: 'blocklist' });

    await flushLogger();
    const m = computeGateMetrics(await loadEvents());

    expect(m.total).toBe(3);
    expect(m.byOutcome.allowed).toBe(1);
    expect(m.byOutcome.rate_limited).toBe(1);
    expect(m.byOutcome.blocked).toBe(1);
    expect(m.byVia.quota).toBe(1);
    expect(m.byVia.blocklist).toBe(1);
  });

  it('sums the tokens compaction saved across kinds', async () => {
    recordEvent('compaction', {
      turnId: 't1', sessionId: 's1', kind: 'auto',
      messagesCompacted: 10, tokensBefore: 5000, tokensAfter: 500, durationMs: 800,
    });
    recordEvent('compaction', {
      turnId: 't2', sessionId: 's1', kind: 'emergency',
      messagesCompacted: 4, tokensBefore: 2000, tokensAfter: 300, durationMs: 400,
    });

    await flushLogger();
    const m = computeCompactionMetrics(await loadEvents());

    expect(m.total).toBe(2);
    expect(m.byKind).toEqual({ auto: 1, emergency: 1 });
    expect(m.messagesCompacted).toBe(14);
    expect(m.tokensSaved).toBe(6200);
    expect(m.avgDurationMs).toBe(600);
  });

  it('aggregates memory retrieval availability, volume, score and latency', async () => {
    recordEvent('memory_retrieval', {
      turnId: 't1', sessionId: 's1', candidates: 6, returned: 3,
      topScore: 0.8, durationMs: 20, providerAvailable: true,
    });
    recordEvent('memory_retrieval', {
      turnId: 't2', sessionId: 's1', candidates: 0, returned: 0,
      topScore: null, durationMs: 40, providerAvailable: false,
    });

    await flushLogger();
    const m = computeMemoryRetrievalMetrics(await loadEvents());

    expect(m).toEqual({
      total: 2,
      providerAvailable: 1,
      providerUnavailable: 1,
      availabilityRate: 0.5,
      candidates: 6,
      returned: 3,
      avgTopScore: 0.8,
      avgDurationMs: 30,
    });
  });

  it('reports the new sections only once they have data', async () => {
    recordEvent('gate_decision', { turnId: 't1', sessionId: 's1', iteration: 1, toolName: 'exec', outcome: 'rate_limited', via: 'quota' });
    recordEvent('memory_retrieval', {
      turnId: 't1', sessionId: 's1', candidates: 4, returned: 2,
      topScore: 0.75, durationMs: 12, providerAvailable: true,
    });

    await flushLogger();
    const shell = shellOrchestrationAndSubagents();
    const events = await loadEvents();
    const planner = computePlannerMetrics(events);
    const loops = computeLoopMetrics(events);
    const tools = computeToolMetrics(events);
    const diagnostics = computeDiagnosticsMetrics(events);
    const llm = computeLLMMetrics(events);
    const gate = computeGateMetrics(events);
    const compaction = computeCompactionMetrics(events);
    const memory = computeMemoryRetrievalMetrics(events);

    const report = formatMetricsForDisplay({
      ...shell, planner, loops, tools, diagnostics, llm, gate, compaction, memory,
    });

    expect(report).toContain('Security gate');
    expect(report).toContain('limited=1');
    expect(report).toContain('Memory retrieval');
    expect(report).toContain('provider avail.   1/1 (100%)');
    expect(report).toContain('candidates/return 4/2');
    expect(report).not.toContain('LLM calls');
    expect(report).not.toContain('Compaction');
  });
});
