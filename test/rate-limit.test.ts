import { describe, it, expect } from 'vitest';
import {
  checkQuota,
  recordHit,
  pruneState,
  resolveQuota,
  formatQuotaRefusal,
  EMPTY_QUOTA_STATE,
  DEFAULT_TOOL_QUOTAS,
  FALLBACK_QUOTA,
  WINDOW_MS,
  type QuotaState,
  type ToolQuota,
} from '../src/security/rate-limit.js';

const QUOTA: ToolQuota = { perMinute: 3, perSession: 5 };
const T0 = 1_000_000;

function stateWith(hits: number[], total = hits.length): QuotaState {
  return { total, recent: hits };
}

describe('checkQuota', () => {
  it('allows the call when nothing has been recorded', () => {
    expect(checkQuota(EMPTY_QUOTA_STATE, QUOTA, T0)).toEqual({ kind: 'within' });
  });

  it('allows the call when usage is below both limits', () => {
    const state = stateWith([T0 - 100, T0 - 50]);
    expect(checkQuota(state, QUOTA, T0)).toEqual({ kind: 'within' });
  });

  it('exceeds the minute scope when the window is full', () => {
    const state = stateWith([T0 - 300, T0 - 200, T0 - 100]);
    const verdict = checkQuota(state, QUOTA, T0);
    expect(verdict).toEqual({
      kind: 'exceeded',
      scope: 'minute',
      retryAfterMs: WINDOW_MS - 300,
    });
  });

  it('allows the call again once the oldest hit ages out of the window', () => {
    const state = stateWith([T0 - WINDOW_MS - 1, T0 - 200, T0 - 100]);
    expect(checkQuota(state, QUOTA, T0)).toEqual({ kind: 'within' });
  });

  it('exceeds the session scope when the total is reached regardless of the window', () => {
    const state = stateWith([], 5);
    expect(checkQuota(state, QUOTA, T0)).toEqual({ kind: 'exceeded', scope: 'session' });
  });

  it('reports the session scope before the minute scope when both are exhausted', () => {
    const state = stateWith([T0 - 30, T0 - 20, T0 - 10], 5);
    expect(checkQuota(state, QUOTA, T0)).toEqual({ kind: 'exceeded', scope: 'session' });
  });
});

describe('recordHit', () => {
  it('increments the session total and appends to the window', () => {
    const next = recordHit(EMPTY_QUOTA_STATE, T0);
    expect(next).toEqual({ total: 1, recent: [T0] });
  });

  it('drops aged-out timestamps while preserving the session total', () => {
    const state = stateWith([T0 - WINDOW_MS - 5, T0 - 10], 2);
    const next = recordHit(state, T0);
    expect(next.total).toBe(3);
    expect(next.recent).toEqual([T0 - 10, T0]);
  });
});

describe('pruneState', () => {
  it('returns the same reference when nothing aged out', () => {
    const state = stateWith([T0 - 10]);
    expect(pruneState(state, T0)).toBe(state);
  });
});

describe('resolveQuota', () => {
  it('prefers a configured override over the built-in default', () => {
    const custom: ToolQuota = { perMinute: 1, perSession: 2 };
    expect(resolveQuota('exec', { exec: custom })).toEqual(custom);
  });

  it('preserves the tool-specific session default for a minute-only override', () => {
    expect(resolveQuota('exec', { exec: { perMinute: 10 } })).toEqual({
      perMinute: 10,
      perSession: 200,
    });
  });

  it('preserves the tool-specific minute default for a session-only override', () => {
    expect(resolveQuota('exec', { exec: { perSession: 100 } })).toEqual({
      perMinute: 20,
      perSession: 100,
    });
  });

  it('merges partial overrides for unknown tools with the generic fallback', () => {
    expect(resolveQuota('read', { read: { perSession: 50 } })).toEqual({
      perMinute: 60,
      perSession: 50,
    });
  });

  it('falls back to the built-in default when no override is configured', () => {
    expect(resolveQuota('exec', {})).toEqual(DEFAULT_TOOL_QUOTAS.exec);
  });

  it('falls back to the generic quota for an unlisted tool', () => {
    expect(resolveQuota('read', {})).toEqual(FALLBACK_QUOTA);
  });
});

describe('formatQuotaRefusal', () => {
  it('names the tool and the wait when the minute window is exhausted', () => {
    const text = formatQuotaRefusal('exec', {
      kind: 'exceeded', scope: 'minute', retryAfterMs: 12_000,
    });
    expect(text).toContain('exec');
    expect(text).toContain('12s');
  });

  it('tells the model to wrap up when the session budget is exhausted', () => {
    const text = formatQuotaRefusal('fetch', { kind: 'exceeded', scope: 'session' });
    expect(text).toContain('fetch');
    expect(text).toContain('sessão');
  });
});
