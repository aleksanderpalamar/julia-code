import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ContextBudget } from '../src/context/budget.js';
import type { ContextHealth } from '../src/context/health.js';

vi.mock('../src/tools/registry.js', () => ({
  executeTool: vi.fn(),
}));
vi.mock('../src/agent/retry.js', () => ({
  maybeDeterministicRetry: vi.fn(),
}));
vi.mock('../src/security/sanitize.js', () => ({
  sanitizeToolResult: vi.fn((t: string) => `[S]${t}`),
}));
vi.mock('../src/security/boundaries.js', () => ({
  wrapToolResult: vi.fn((_: string, t: string) => `[W]${t}`),
}));
vi.mock('../src/context/budget.js', () => ({
  computeToolResultCap: vi.fn(),
}));
vi.mock('../src/context/health.js', () => ({
  getToolResultCapFactor: vi.fn(),
}));

import { runToolCall } from '../src/agent/tool-executor.js';
import { executeTool } from '../src/tools/registry.js';
import { maybeDeterministicRetry } from '../src/agent/retry.js';
import { sanitizeToolResult } from '../src/security/sanitize.js';
import { wrapToolResult } from '../src/security/boundaries.js';
import { computeToolResultCap } from '../src/context/budget.js';
import { getToolResultCapFactor } from '../src/context/health.js';

const health: ContextHealth = {
  level: 'ok',
  usedTokens: 0,
  totalTokens: 8000,
  pctUsed: 0,
} as unknown as ContextHealth;

const budget: ContextBudget = { total: 8000, system: 0, reserved: 0, available: 8000 } as unknown as ContextBudget;

beforeEach(() => {
  vi.mocked(executeTool).mockReset();
  vi.mocked(maybeDeterministicRetry).mockReset();
  vi.mocked(sanitizeToolResult).mockImplementation((t: string) => `[S]${t}`);
  vi.mocked(wrapToolResult).mockImplementation((_: string, t: string) => `[W]${t}`);
  vi.mocked(computeToolResultCap).mockReset();
  vi.mocked(getToolResultCapFactor).mockReset();
});

describe('runToolCall / success path', () => {
  it('passes success output through sanitize → wrap', async () => {
    vi.mocked(executeTool).mockResolvedValue({ success: true, output: 'hello' });

    const executed = await runToolCall({
      toolName: 'read',
      args: { path: 'x.ts' },
      budget: null,
      health,
    });

    expect(executed.success).toBe(true);
    expect(executed.resultText).toBe('[W][S]hello');
    expect(executed.deterministicRetryApplied).toBe(false);
    expect(sanitizeToolResult).toHaveBeenCalledWith('hello');
    expect(wrapToolResult).toHaveBeenCalledWith('read', '[S]hello');
  });

  it('measures durationMs', async () => {
    vi.mocked(executeTool).mockResolvedValue({ success: true, output: 'ok' });

    const executed = await runToolCall({ toolName: 'read', args: {}, budget: null, health });

    expect(executed.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('runToolCall / failure + deterministic retry', () => {
  it('formats error output and does NOT flag retry when no hint', async () => {
    vi.mocked(executeTool).mockResolvedValue({ success: false, output: 'ctx', error: 'boom' });
    vi.mocked(maybeDeterministicRetry).mockResolvedValue(null);

    const executed = await runToolCall({ toolName: 'exec', args: {}, budget: null, health });

    expect(executed.success).toBe(false);
    expect(executed.deterministicRetryApplied).toBe(false);
    expect(executed.resultText).toContain('Error: boom');
    expect(executed.resultText).toContain('ctx');
  });

  it('appends retry hint and flags deterministicRetryApplied', async () => {
    vi.mocked(executeTool).mockResolvedValue({ success: false, output: 'ctx', error: 'boom' });
    vi.mocked(maybeDeterministicRetry).mockResolvedValue({ hint: ' [try again]' } as any);

    const executed = await runToolCall({ toolName: 'exec', args: {}, budget: null, health });

    expect(executed.deterministicRetryApplied).toBe(true);
    expect(executed.resultText).toContain('Error: boom [try again]');
  });
});

describe('runToolCall / truncation', () => {
  it('respects budget × health cap factor', async () => {
    const big = 'A'.repeat(20000);
    vi.mocked(executeTool).mockResolvedValue({ success: true, output: big });
    vi.mocked(computeToolResultCap).mockReturnValue(10000);
    vi.mocked(getToolResultCapFactor).mockReturnValue(0.5);

    const executed = await runToolCall({ toolName: 'read', args: {}, budget, health });

    // cap = floor(10000 * 0.5) = 5000. After sanitize+wrap prefixes ("[W][S]") the length grows
    // by a constant amount (6 chars).
    expect(executed.resultText.length).toBeLessThanOrEqual(5000 + '[W][S]'.length + '\n... [truncated — use offset/limit for large files]'.length);
    expect(executed.resultText).toContain('[truncated');
  });

  it('uses default 12000 cap when no budget provided', async () => {
    const big = 'B'.repeat(20000);
    vi.mocked(executeTool).mockResolvedValue({ success: true, output: big });

    const executed = await runToolCall({ toolName: 'read', args: {}, budget: null, health });

    expect(executed.resultText).toContain('[truncated');
    expect(computeToolResultCap).not.toHaveBeenCalled();
  });

  it('does not truncate when result fits in cap', async () => {
    vi.mocked(executeTool).mockResolvedValue({ success: true, output: 'short' });
    vi.mocked(computeToolResultCap).mockReturnValue(10000);
    vi.mocked(getToolResultCapFactor).mockReturnValue(1);

    const executed = await runToolCall({ toolName: 'read', args: {}, budget, health });

    expect(executed.resultText).not.toContain('[truncated');
    expect(executed.resultText).toBe('[W][S]short');
  });
});
