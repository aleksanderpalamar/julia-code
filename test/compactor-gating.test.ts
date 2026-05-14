import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/agent/context.js', () => ({
  getCompactableMessages: vi.fn(),
  getEmergencyCompactableMessages: vi.fn(),
}));

vi.mock('../src/session/manager.js', () => ({
  getLatestCompaction: vi.fn().mockReturnValue(null),
  saveCompaction: vi.fn(),
}));

vi.mock('../src/context/compaction.js', () => ({
  performStructuredCompaction: vi.fn().mockResolvedValue({}),
  serializeCompaction: vi.fn().mockReturnValue(''),
  deserializeCompaction: vi.fn(),
  formatCompactionForContext: vi.fn(),
}));

import { maybeCompact } from '../src/agent/compactor.js';
import { getCompactableMessages } from '../src/agent/context.js';

beforeEach(() => {
  vi.mocked(getCompactableMessages).mockReset();
});

describe('maybeCompact / beforeCompact callback', () => {
  it('does NOT call beforeCompact when no compaction is needed', async () => {
    vi.mocked(getCompactableMessages).mockResolvedValue(null);
    const cb = vi.fn().mockResolvedValue(true);
    const result = await maybeCompact('s', 'm', cb);
    expect(result).toBe(false);
    expect(cb).not.toHaveBeenCalled();
  });

  it('calls beforeCompact and aborts when it returns false', async () => {
    vi.mocked(getCompactableMessages).mockResolvedValue({ messages: [], lastId: 1 });
    const cb = vi.fn().mockResolvedValue(false);
    const result = await maybeCompact('s', 'm', cb);
    expect(result).toBe(false);
    expect(cb).toHaveBeenCalledOnce();
  });

  it('proceeds with compaction when beforeCompact returns true', async () => {
    vi.mocked(getCompactableMessages).mockResolvedValue({ messages: [], lastId: 1 });
    const cb = vi.fn().mockResolvedValue(true);
    const result = await maybeCompact('s', 'm', cb);
    expect(result).toBe(true);
    expect(cb).toHaveBeenCalledOnce();
  });

  it('still works when beforeCompact is omitted (back-compat)', async () => {
    vi.mocked(getCompactableMessages).mockResolvedValue({ messages: [], lastId: 1 });
    const result = await maybeCompact('s', 'm');
    expect(result).toBe(true);
  });
});
