import { createHash } from 'node:crypto';

export interface CachedPlannerResult {
  complex: boolean;
  subtasks?: Array<{ task: string; model?: string | null }>;
}

interface CacheEntry {
  value: CachedPlannerResult;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 128;

let ttlMs = DEFAULT_TTL_MS;
const store = new Map<string, CacheEntry>();

function buildKey(sessionId: string, userMessage: string): string {
  const h = createHash('sha256').update(userMessage).digest('hex').slice(0, 16);
  return `${sessionId}:${h}`;
}

function sweep(now: number): void {
  for (const [k, entry] of store) {
    if (entry.expiresAt <= now) store.delete(k);
  }
}

function enforceCap(): void {
  while (store.size > MAX_ENTRIES) {
    const firstKey = store.keys().next().value;
    if (firstKey === undefined) break;
    store.delete(firstKey);
  }
}

export function getCachedPlannerResult(
  sessionId: string,
  userMessage: string,
): CachedPlannerResult | null {
  const now = Date.now();
  sweep(now);
  const key = buildKey(sessionId, userMessage);
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function setCachedPlannerResult(
  sessionId: string,
  userMessage: string,
  value: CachedPlannerResult,
): void {
  store.set(buildKey(sessionId, userMessage), {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  enforceCap();
}

export function clearPlannerCacheForTests(): void {
  store.clear();
  ttlMs = DEFAULT_TTL_MS;
}

export function setPlannerCacheTtlForTests(ms: number): void {
  ttlMs = ms;
}
