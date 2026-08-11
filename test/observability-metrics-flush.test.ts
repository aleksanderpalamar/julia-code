import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('../src/session/db.js', () => ({
  getDb: () => ({
    prepare: () => ({ all: () => [] }),
  }),
}));

import { recordEvent, resetLoggerStateForTests } from '../src/observability/logger.js';
import { getAllMetrics } from '../src/observability/metrics/index.js';

let logDir: string;

describe('getAllMetrics', () => {
  beforeEach(() => {
    logDir = mkdtempSync(join(tmpdir(), 'juliacode-stats-flush-'));
    process.env.JULIA_LOG_DIR = logDir;
    resetLoggerStateForTests();
  });

  afterEach(() => {
    delete process.env.JULIA_LOG_DIR;
    rmSync(logDir, { recursive: true, force: true });
  });

  it('flushes queued events before loading the log', async () => {
    recordEvent('loop_end', {
      turnId: 'turn-immediate', sessionId: 's1', iterations: 2, reason: 'done',
    });

    const metrics = await getAllMetrics();

    expect(metrics.loops.totalLoops).toBe(1);
    expect(metrics.loops.avgIterations).toBe(2);
  });
});
