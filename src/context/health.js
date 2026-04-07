"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assessHealth = assessHealth;
exports.shouldEmergencyCompact = shouldEmergencyCompact;
exports.getEmergencyKeepCount = getEmergencyKeepCount;
exports.getToolResultCapFactor = getToolResultCapFactor;
exports.getContextWarningMessage = getContextWarningMessage;
var token_counter_js_1 = require("./token-counter.js");
function assessHealth(messages, budget) {
    var usedTokens = (0, token_counter_js_1.estimateMessagesTokens)(messages);
    var usagePercent = Math.round((usedTokens / budget.available) * 100);
    var warningLevel = getWarningLevel(usagePercent);
    return {
        totalBudget: budget.available,
        usedTokens: usedTokens,
        usagePercent: usagePercent,
        warningLevel: warningLevel,
    };
}
function shouldEmergencyCompact(health) {
    return health.warningLevel === 'critical' || health.warningLevel === 'emergency';
}
function getEmergencyKeepCount(health) {
    if (health.warningLevel === 'emergency')
        return 3;
    if (health.warningLevel === 'critical')
        return 4;
    return 6;
}
function getToolResultCapFactor(health) {
    switch (health.warningLevel) {
        case 'emergency': return 0.3;
        case 'critical': return 0.5;
        case 'warning': return 0.75;
        default: return 1.0;
    }
}
function getContextWarningMessage(health) {
    switch (health.warningLevel) {
        case 'warning':
            return "\u26A0\uFE0F Contexto em ".concat(health.usagePercent, "% de uso. Seja conciso nas respostas. Evite re-ler arquivos j\u00E1 no contexto.");
        case 'critical':
            return "\uD83D\uDD34 Contexto em ".concat(health.usagePercent, "% \u2014 CR\u00CDTICO. Respostas ultra-concisas. Compaction de emerg\u00EAncia ativada.");
        case 'emergency':
            return "\uD83D\uDEA8 Contexto em ".concat(health.usagePercent, "% \u2014 EMERG\u00CANCIA. Risco de perda de contexto. Apenas a\u00E7\u00F5es essenciais.");
        default:
            return null;
    }
}
function getWarningLevel(usagePercent) {
    if (usagePercent >= 95)
        return 'emergency';
    if (usagePercent >= 85)
        return 'critical';
    if (usagePercent >= 70)
        return 'warning';
    return 'ok';
}
