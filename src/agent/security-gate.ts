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
  approvedAllForSession: { current: boolean };
  requestApproval: (toolName: string, args: Record<string, unknown>) => Promise<ApprovalResult>;
}

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
