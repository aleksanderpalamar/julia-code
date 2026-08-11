export interface ToolQuota {
  perMinute: number;
  perSession: number;
}

export type ToolQuotaOverride = Partial<ToolQuota>;

export interface QuotaState {
  readonly total: number;
  readonly recent: readonly number[];
}

export type QuotaVerdict =
  | { kind: 'within' }
  | { kind: 'exceeded'; scope: 'minute'; retryAfterMs: number }
  | { kind: 'exceeded'; scope: 'session' };

export interface QuotaGuard {
  check(toolName: string, now: number): QuotaVerdict;
  record(toolName: string, now: number): void;
}

export const WINDOW_MS = 60_000;

export const EMPTY_QUOTA_STATE: QuotaState = { total: 0, recent: [] };

export const DEFAULT_TOOL_QUOTAS: Readonly<Record<string, ToolQuota>> = {
  exec: { perMinute: 20, perSession: 200 },
  fetch: { perMinute: 30, perSession: 300 },
  subagent: { perMinute: 5, perSession: 40 },
};

export const FALLBACK_QUOTA: ToolQuota = { perMinute: 60, perSession: 600 };

export function pruneState(state: QuotaState, now: number): QuotaState {
  const recent = state.recent.filter(hit => now - hit < WINDOW_MS);
  return recent.length === state.recent.length ? state : { total: state.total, recent };
}

function sessionBudgetSpent(state: QuotaState, quota: ToolQuota): boolean {
  return state.total >= quota.perSession;
}

function windowFull(state: QuotaState, quota: ToolQuota): boolean {
  return state.recent.length >= quota.perMinute;
}

function millisUntilOldestExpires(state: QuotaState, now: number): number {
  return Math.max(0, WINDOW_MS - (now - state.recent[0]));
}

export function checkQuota(state: QuotaState, quota: ToolQuota, now: number): QuotaVerdict {
  if (sessionBudgetSpent(state, quota)) {
    return { kind: 'exceeded', scope: 'session' };
  }

  const pruned = pruneState(state, now);
  if (!windowFull(pruned, quota)) {
    return { kind: 'within' };
  }

  return {
    kind: 'exceeded',
    scope: 'minute',
    retryAfterMs: millisUntilOldestExpires(pruned, now),
  };
}

export function recordHit(state: QuotaState, now: number): QuotaState {
  const pruned = pruneState(state, now);
  return { total: pruned.total + 1, recent: [...pruned.recent, now] };
}

export function resolveQuota(
  toolName: string,
  overrides: Readonly<Record<string, ToolQuotaOverride>>,
  fallback: ToolQuota = FALLBACK_QUOTA,
): ToolQuota {
  const base = DEFAULT_TOOL_QUOTAS[toolName] ?? fallback;
  const override = overrides[toolName];
  return override ? { ...base, ...override } : base;
}

export function formatQuotaRefusal(toolName: string, verdict: QuotaVerdict): string {
  if (verdict.kind === 'within') return '';

  if (verdict.scope === 'session') {
    return `Limite de uso da ferramenta "${toolName}" atingido para esta sessão. `
      + `Conclua com o que já foi coletado ou peça ao usuário para iniciar uma nova sessão.`;
  }

  const seconds = Math.ceil(verdict.retryAfterMs / 1000);
  return `Limite de uso da ferramenta "${toolName}" atingido (janela de 1 minuto). `
    + `Aguarde ~${seconds}s ou siga por outra abordagem.`;
}
