import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedPlannerResult,
  setCachedPlannerResult,
  clearPlannerCacheForTests,
  setPlannerCacheTtlForTests,
  type CachedPlannerResult,
} from '../src/agent/planner-cache.js';

describe('planner cache (Fase 3.3)', () => {
  beforeEach(() => {
    clearPlannerCacheForTests();
  });

  it('returns null on miss', () => {
    expect(getCachedPlannerResult('s1', 'hello')).toBeNull();
  });

  it('returns the stored value on hit', () => {
    const value: CachedPlannerResult = {
      complex: true,
      subtasks: [{ task: 'a' }, { task: 'b' }],
    };
    setCachedPlannerResult('s1', 'hello', value);
    expect(getCachedPlannerResult('s1', 'hello')).toEqual(value);
  });

  it('scopes entries by sessionId — same message in a different session is a miss', () => {
    const value: CachedPlannerResult = { complex: true, subtasks: [{ task: 'x' }] };
    setCachedPlannerResult('s1', 'hello', value);

    expect(getCachedPlannerResult('s1', 'hello')).toEqual(value);
    expect(getCachedPlannerResult('s2', 'hello')).toBeNull();
  });

  it('distinguishes different messages in the same session', () => {
    setCachedPlannerResult('s1', 'first', { complex: true, subtasks: [{ task: 'a' }] });
    setCachedPlannerResult('s1', 'second', { complex: false });

    expect(getCachedPlannerResult('s1', 'first')).toEqual({
      complex: true,
      subtasks: [{ task: 'a' }],
    });
    expect(getCachedPlannerResult('s1', 'second')).toEqual({ complex: false });
  });

  it('caches {complex: false} verdicts too (not only decompositions)', () => {
    setCachedPlannerResult('s1', 'simple task', { complex: false });
    expect(getCachedPlannerResult('s1', 'simple task')).toEqual({ complex: false });
  });

  it('expires entries after the TTL', async () => {
    setPlannerCacheTtlForTests(20);
    setCachedPlannerResult('s1', 'hello', { complex: true, subtasks: [{ task: 'a' }] });

    expect(getCachedPlannerResult('s1', 'hello')).not.toBeNull();

    await new Promise(r => setTimeout(r, 40));

    expect(getCachedPlannerResult('s1', 'hello')).toBeNull();
  });

  it('treats byte-identical message + session as the same key (stable hashing)', () => {
    const value: CachedPlannerResult = { complex: true, subtasks: [{ task: 'a' }] };
    setCachedPlannerResult('s1', 'cria Header.tsx e Footer.tsx', value);

    expect(getCachedPlannerResult('s1', 'cria Header.tsx e Footer.tsx')).toEqual(value);
    expect(getCachedPlannerResult('s1', 'cria Header.tsx e Footer.tsx ')).toBeNull();
  });
});
