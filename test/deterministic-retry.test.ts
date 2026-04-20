import { describe, it, expect, beforeEach, vi } from 'vitest';

const executeToolMock = vi.fn();

vi.mock('../src/tools/registry.js', () => ({
  executeTool: (...args: unknown[]) => executeToolMock(...args),
}));

import { maybeDeterministicRetry } from '../src/agent/retry.js';

describe('maybeDeterministicRetry (Fase 3.1)', () => {
  beforeEach(() => {
    executeToolMock.mockReset();
  });

  it('produces a hint when ENOENT + valid path + glob finds candidates', async () => {
    executeToolMock.mockResolvedValue({
      success: true,
      output: 'src/utils/foo.ts\nsrc/lib/foo.ts',
    });

    const r = await maybeDeterministicRetry(
      "ENOENT: no such file or directory, open 'foo.ts'",
      { path: 'foo.ts' },
    );

    expect(r).not.toBeNull();
    expect(r!.hint).toContain('src/utils/foo.ts');
    expect(r!.hint).toContain('src/lib/foo.ts');
    expect(r!.attempted).toContain('glob');
    expect(executeToolMock).toHaveBeenCalledTimes(1);
    expect(executeToolMock).toHaveBeenCalledWith('glob', { pattern: '**/foo.ts' });
  });

  it('returns null when glob reports no matches', async () => {
    executeToolMock.mockResolvedValue({
      success: true,
      output: 'No files found matching pattern.',
    });

    const r = await maybeDeterministicRetry(
      "ENOENT: no such file or directory, open 'nonexistent.xyz'",
      { path: 'nonexistent.xyz' },
    );

    expect(r).toBeNull();
  });

  it('returns null when the error does not match a missing-path pattern', async () => {
    const r = await maybeDeterministicRetry(
      'EACCES: permission denied, open /etc/shadow',
      { path: '/etc/shadow' },
    );

    expect(r).toBeNull();
    expect(executeToolMock).not.toHaveBeenCalled();
  });

  it('returns null when args do not contain a path-shaped key', async () => {
    const r = await maybeDeterministicRetry(
      'ENOENT: no such file or directory',
      { command: 'cat foo.ts' },
    );

    expect(r).toBeNull();
    expect(executeToolMock).not.toHaveBeenCalled();
  });

  it('returns null when the path arg already looks like a glob pattern', async () => {
    const r = await maybeDeterministicRetry(
      'not found',
      { path: 'src/**/*.ts' },
    );

    expect(r).toBeNull();
    expect(executeToolMock).not.toHaveBeenCalled();
  });

  it('only issues one probe per call (hard-cap is enforced by the single dispatch)', async () => {
    executeToolMock.mockResolvedValue({ success: true, output: 'found.ts' });

    await maybeDeterministicRetry('not found', { path: 'found.ts' });

    expect(executeToolMock).toHaveBeenCalledTimes(1);
  });

  it('uses the basename when the failing path is nested', async () => {
    executeToolMock.mockResolvedValue({
      success: true,
      output: 'src/agent/loop.ts',
    });

    await maybeDeterministicRetry(
      "ENOENT: no such file or directory, open 'wrong/dir/loop.ts'",
      { path: 'wrong/dir/loop.ts' },
    );

    expect(executeToolMock).toHaveBeenCalledWith('glob', { pattern: '**/loop.ts' });
  });

  it('reads file_path and filepath aliases too', async () => {
    executeToolMock.mockResolvedValue({ success: true, output: 'a.ts' });

    await maybeDeterministicRetry('not found', { file_path: 'a.ts' });
    expect(executeToolMock).toHaveBeenLastCalledWith('glob', { pattern: '**/a.ts' });

    await maybeDeterministicRetry('not found', { filepath: 'b.ts' });
    expect(executeToolMock).toHaveBeenLastCalledWith('glob', { pattern: '**/b.ts' });
  });

  it('swallows glob failure and returns null (never throws)', async () => {
    executeToolMock.mockResolvedValue({ success: false, output: '', error: 'boom' });

    const r = await maybeDeterministicRetry('not found', { path: 'x.ts' });

    expect(r).toBeNull();
  });
});
