import { computeToolResultCap, type ContextBudget } from '../../context/budget.js';
import { getToolResultCapFactor, type ContextHealth } from '../../context/health.js';

export const DEFAULT_MAX_RESULT_CHARS = 12000;

export function computeResultLimit(
  toolName: string,
  budget: ContextBudget | null,
  health: ContextHealth,
): number {
  if (!budget) return DEFAULT_MAX_RESULT_CHARS;
  const baseCap = computeToolResultCap(budget, toolName);
  const capFactor = getToolResultCapFactor(health);
  return Math.floor(baseCap * capFactor);
}
