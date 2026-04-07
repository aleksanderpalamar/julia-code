import type { ChatMessage } from '../providers/types.js';
import type { ContextBudget } from './budget.js';
import { estimateMessagesTokens } from './token-counter.js';

export type WarningLevel = 'ok' | 'warning' | 'critical' | 'emergency';

export interface ContextHealth {
  totalBudget: number;
  usedTokens: number;
  usagePercent: number;
  warningLevel: WarningLevel;
}

export function assessHealth(messages: ChatMessage[], budget: ContextBudget): ContextHealth {
  const usedTokens = estimateMessagesTokens(messages);
  const usagePercent = Math.round((usedTokens / budget.available) * 100);
  const warningLevel = getWarningLevel(usagePercent);

  return {
    totalBudget: budget.available,
    usedTokens,
    usagePercent,
    warningLevel,
  };
}

export function shouldEmergencyCompact(health: ContextHealth): boolean {
  return health.warningLevel === 'critical' || health.warningLevel === 'emergency';
}

export function getEmergencyKeepCount(health: ContextHealth): number {
  if (health.warningLevel === 'emergency') return 3;
  if (health.warningLevel === 'critical') return 4;
  return 6;
}

export function getToolResultCapFactor(health: ContextHealth): number {
  switch (health.warningLevel) {
    case 'emergency': return 0.3;
    case 'critical': return 0.5;
    case 'warning': return 0.75;
    default: return 1.0;
  }
}

export function getContextWarningMessage(health: ContextHealth): string | null {
  switch (health.warningLevel) {
    case 'warning':
      return `⚠️ Contexto em ${health.usagePercent}% de uso. Seja conciso nas respostas. Evite re-ler arquivos já no contexto.`;
    case 'critical':
      return `🔴 Contexto em ${health.usagePercent}% — CRÍTICO. Respostas ultra-concisas. Compaction de emergência ativada.`;
    case 'emergency':
      return `🚨 Contexto em ${health.usagePercent}% — EMERGÊNCIA. Risco de perda de contexto. Apenas ações essenciais.`;
    default:
      return null;
  }
}

function getWarningLevel(usagePercent: number): WarningLevel {
  if (usagePercent >= 95) return 'emergency';
  if (usagePercent >= 85) return 'critical';
  if (usagePercent >= 70) return 'warning';
  return 'ok';
}
