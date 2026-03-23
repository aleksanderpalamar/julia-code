import type { ChatMessage } from '../providers/types.js';
import type { ContextBudget } from './budget.js';
import { estimateMessagesTokens } from './token-counter.js';

export type WarningLevel = 'ok' | 'warning' | 'critical' | 'emergency';

export interface ContextHealth {
  /** Total usable budget in tokens */
  totalBudget: number;
  /** Estimated tokens currently in use */
  usedTokens: number;
  /** Usage as percentage (0-100) */
  usagePercent: number;
  /** Warning level based on thresholds */
  warningLevel: WarningLevel;
}

/**
 * Assess the health of the current context window.
 */
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

/**
 * Check if emergency compaction should be triggered.
 */
export function shouldEmergencyCompact(health: ContextHealth): boolean {
  return health.warningLevel === 'critical' || health.warningLevel === 'emergency';
}

/**
 * Get the minimum number of recent messages to keep during emergency compaction.
 */
export function getEmergencyKeepCount(health: ContextHealth): number {
  if (health.warningLevel === 'emergency') return 3;
  if (health.warningLevel === 'critical') return 4;
  return 6;
}

/**
 * Get the tool result cap reduction factor for high-usage scenarios.
 * Returns a multiplier (e.g., 0.5 means reduce caps by 50%).
 */
export function getToolResultCapFactor(health: ContextHealth): number {
  switch (health.warningLevel) {
    case 'emergency': return 0.3;
    case 'critical': return 0.5;
    case 'warning': return 0.75;
    default: return 1.0;
  }
}

/**
 * Generate a context warning message to inject into the system prompt.
 * Returns null if no warning is needed.
 */
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
