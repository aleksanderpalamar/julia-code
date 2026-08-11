import {
  getToolRisk,
  isBlockedCommand,
  matchesAllowRule,
  type AllowRule,
} from '../security/permissions.js';
import { formatQuotaRefusal, type QuotaGuard } from '../security/rate-limit.js';
import type { GateVia } from '../observability/logger.js';
import type { ApprovalResult } from '../tui/components/ApprovalPrompt.js';

export type GateOutcome =
  | { kind: 'blocked'; reason: string; via: GateVia }
  | { kind: 'rate_limited'; reason: string; via: 'quota' }
  | { kind: 'denied'; via: 'user' }
  | { kind: 'allowed'; via: GateVia }
  | { kind: 'approve_all'; via: 'user' };

interface GateInput {
  toolName: string;
  args: Record<string, unknown>;
  allowRules: AllowRule[];
  approvedAllForSession: { current: boolean };
  requestApproval: (toolName: string, args: Record<string, unknown>) => Promise<ApprovalResult>;
  preApproved?: boolean;
  quotas?: QuotaGuard;
  now?: () => number;
}

export async function evaluateToolCall(input: GateInput): Promise<GateOutcome> {
  const {
    toolName, args, allowRules, approvedAllForSession, requestApproval, preApproved, quotas,
  } = input;
  const now = input.now ?? Date.now;

  if (toolName === 'exec' && isBlockedCommand(args.command as string)) {
    return {
      kind: 'blocked',
      reason: 'Operação bloqueada: este comando está na blocklist de segurança.',
      via: 'blocklist',
    };
  }

  if (quotas) {
    const verdict = quotas.check(toolName, now());
    if (verdict.kind === 'exceeded') {
      return { kind: 'rate_limited', reason: formatQuotaRefusal(toolName, verdict), via: 'quota' };
    }
  }

  const outcome = await decideConsent({
    toolName, args, allowRules, approvedAllForSession, requestApproval, preApproved,
  });

  if (outcome.kind !== 'denied') {
    quotas?.record(toolName, now());
  }

  return outcome;
}

async function decideConsent(input: {
  toolName: string;
  args: Record<string, unknown>;
  allowRules: AllowRule[];
  approvedAllForSession: { current: boolean };
  requestApproval: (toolName: string, args: Record<string, unknown>) => Promise<ApprovalResult>;
  preApproved?: boolean;
}): Promise<GateOutcome> {
  const { toolName, args, allowRules, approvedAllForSession, requestApproval, preApproved } = input;

  if (preApproved) {
    return { kind: 'allowed', via: 'hook' };
  }

  const risk = getToolRisk(toolName);
  if (risk !== 'dangerous') {
    return { kind: 'allowed', via: 'risk' };
  }
  if (approvedAllForSession.current) {
    return { kind: 'allowed', via: 'user' };
  }

  if (matchesAllowRule(toolName, args, allowRules)) {
    return { kind: 'allowed', via: 'allow-rule' };
  }

  const approved = await requestApproval(toolName, args);
  if (approved === 'deny') return { kind: 'denied', via: 'user' };
  if (approved === 'approve_all') {
    approvedAllForSession.current = true;
    return { kind: 'approve_all', via: 'user' };
  }
  return { kind: 'allowed', via: 'user' };
}
