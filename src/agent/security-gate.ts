import {
  getToolRisk,
  isBlockedCommand,
  matchesAllowRule,
  type AllowRule,
} from '../security/permissions.js';
import type { ApprovalResult } from '../tui/components/ApprovalPrompt.js';

export type GateOutcome =
  | { kind: 'blocked'; reason: string }
  | { kind: 'denied' }
  | { kind: 'allowed' }
  | { kind: 'approve_all' };

export interface GateInput {
  toolName: string;
  args: Record<string, unknown>;
  allowRules: AllowRule[];
  /** Mutable ref — set to true when the user picks "approve all" for the session. */
  approvedAllForSession: { current: boolean };
  requestApproval: (toolName: string, args: Record<string, unknown>) => Promise<ApprovalResult>;
}

/**
 * Evaluate a tool call against the session's security policy.
 *
 * Order of checks:
 *   1. Hard blocklist (e.g. `exec` with a blocked command) → 'blocked'.
 *   2. Low/medium risk or already approved-all for session → 'allowed'.
 *   3. Dangerous + matching allow-rule → 'allowed'.
 *   4. Otherwise prompt the user via `requestApproval`:
 *        'deny' → 'denied'
 *        'approve_all' → 'approve_all' (caller flips the ref)
 *        anything else (including 'approve') → 'allowed'
 */
export async function evaluateToolCall(input: GateInput): Promise<GateOutcome> {
  const { toolName, args, allowRules, approvedAllForSession, requestApproval } = input;

  if (toolName === 'exec' && isBlockedCommand(args.command as string)) {
    return { kind: 'blocked', reason: 'Operação bloqueada: este comando está na blocklist de segurança.' };
  }

  const risk = getToolRisk(toolName);
  if (risk !== 'dangerous' || approvedAllForSession.current) {
    return { kind: 'allowed' };
  }

  if (matchesAllowRule(toolName, args, allowRules)) {
    return { kind: 'allowed' };
  }

  const approved = await requestApproval(toolName, args);
  if (approved === 'deny') return { kind: 'denied' };
  if (approved === 'approve_all') {
    approvedAllForSession.current = true;
    return { kind: 'approve_all' };
  }
  return { kind: 'allowed' };
}
