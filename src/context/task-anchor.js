"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTaskAnchor = extractTaskAnchor;
exports.formatTaskAnchor = formatTaskAnchor;
var manager_js_1 = require("../session/manager.js");
function extractTaskAnchor(sessionId) {
    var messages = (0, manager_js_1.getMessages)(sessionId);
    var firstUserMsg = messages.find(function (m) { return m.role === 'user'; });
    if (!firstUserMsg)
        return null;
    var text = firstUserMsg.content.trim();
    if (!text)
        return null;
    if (text.length <= 500)
        return text;
    var sentences = text.match(/[^.!?\n]+[.!?\n]?/g);
    if (sentences && sentences.length >= 2) {
        return sentences.slice(0, 2).join('').trim();
    }
    return text.slice(0, 500) + '...';
}
function formatTaskAnchor(anchor) {
    return [
        '## Tarefa Atual',
        "Seu objetivo principal nesta sess\u00E3o: ".concat(anchor),
        '',
        'Mantenha foco neste objetivo. Não desvie para trabalho não relacionado.',
        'Antes de cada ação, verifique se ela contribui diretamente para este objetivo.',
    ].join('\n');
}
