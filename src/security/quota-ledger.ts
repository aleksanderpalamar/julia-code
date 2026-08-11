import {
  checkQuota,
  recordHit,
  resolveQuota,
  EMPTY_QUOTA_STATE,
  type QuotaGuard,
  type QuotaState,
  type ToolQuotaOverride,
} from './rate-limit.js';

export class ToolQuotaLedger {
  private readonly sessions = new Map<string, Map<string, QuotaState>>();

  constructor(private readonly overrides: Readonly<Record<string, ToolQuotaOverride>> = {}) {}

  forSession(sessionId: string): QuotaGuard {
    return {
      check: (toolName, now) => checkQuota(
        this.stateOf(sessionId, toolName),
        resolveQuota(toolName, this.overrides),
        now,
      ),
      record: (toolName, now) => {
        this.toolsOf(sessionId).set(toolName, recordHit(this.stateOf(sessionId, toolName), now));
      },
    };
  }

  reset(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private toolsOf(sessionId: string): Map<string, QuotaState> {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;

    const created = new Map<string, QuotaState>();
    this.sessions.set(sessionId, created);
    return created;
  }

  private stateOf(sessionId: string, toolName: string): QuotaState {
    return this.toolsOf(sessionId).get(toolName) ?? EMPTY_QUOTA_STATE;
  }
}
