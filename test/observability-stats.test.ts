import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  log,
  resetLoggerStateForTests,
} from '../src/observability/logger.js';
import {
  computePlannerMetrics,
  formatMetricsForDisplay,
  computeLoopMetrics,
  computeToolMetrics,
  type AllMetrics,
} from '../src/observability/metrics.js';

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
    const m = await computePlannerMetrics();
    expect(m.total).toBe(0);
    expect(m.byVia.heuristic).toBe(0);
    expect(m.byVia.llm).toBe(0);
    expect(m.byVia.cache).toBe(0);
    expect(m.cacheHitRate).toBeNull();
  });

  it('groups decisions by via', async () => {
    log.plannerDecision({ sessionId: 's1', complex: false, subtaskCount: 0, via: 'heuristic', durationMs: 1, taskPreview: 'hi' });
    log.plannerDecision({ sessionId: 's1', complex: true, subtaskCount: 3, via: 'llm', durationMs: 500, taskPreview: 'refatore' });
    log.plannerDecision({ sessionId: 's1', complex: true, subtaskCount: 3, via: 'cache', durationMs: 2, taskPreview: 'refatore' });
    log.plannerDecision({ sessionId: 's1', complex: true, subtaskCount: 3, via: 'cache', durationMs: 1, taskPreview: 'refatore' });

    await flushLogger();

    const m = await computePlannerMetrics();
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
    log.plannerDecision({ sessionId: 's1', complex: true, subtaskCount: 3, via: 'llm', durationMs: 500, taskPreview: 'x' });
    log.plannerDecision({ sessionId: 's1', complex: true, subtaskCount: 3, via: 'cache', durationMs: 2, taskPreview: 'x' });
    log.toolCall({ sessionId: 's1', iteration: 1, name: 'read', success: true, durationMs: 10 });
    log.loopEnd({ sessionId: 's1', iterations: 5, reason: 'done' });

    await flushLogger();

    const shell = shellOrchestrationAndSubagents();
    const [planner, loops, tools] = await Promise.all([
      computePlannerMetrics(),
      computeLoopMetrics(),
      computeToolMetrics(),
    ]);

    const report = formatMetricsForDisplay({ ...shell, planner, loops, tools });

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
