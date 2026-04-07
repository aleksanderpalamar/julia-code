"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreMessage = scoreMessage;
exports.selectMessagesForRetention = selectMessagesForRetention;
var token_counter_js_1 = require("./token-counter.js");
function scoreMessage(msg, isFirstUserMessage) {
    if (isFirstUserMessage && msg.role === 'user')
        return 1.0;
    switch (msg.role) {
        case 'user':
            return 0.7;
        case 'assistant': {
            if (msg.tool_calls)
                return 0.6;
            return 0.4;
        }
        case 'tool': {
            var toolName = extractToolName(msg.content);
            switch (toolName) {
                case 'write':
                case 'edit':
                    return 0.8;
                case 'exec':
                    return 0.6;
                case 'read':
                    return 0.5;
                case 'grep':
                case 'glob':
                    return 0.4;
                case 'fetch':
                    return 0.5;
                default:
                    return 0.5;
            }
        }
        case 'system':
            return 0.3;
        default:
            return 0.3;
    }
}
function selectMessagesForRetention(messages, budgetTokens, minRecentCount) {
    var _a;
    if (minRecentCount === void 0) { minRecentCount = 6; }
    if (messages.length <= minRecentCount) {
        return { toKeep: messages, toCompact: [] };
    }
    var recentMessages = messages.slice(-minRecentCount);
    var olderMessages = messages.slice(0, -minRecentCount);
    var usedTokens = 0;
    for (var _i = 0, recentMessages_1 = recentMessages; _i < recentMessages_1.length; _i++) {
        var msg = recentMessages_1[_i];
        usedTokens += (0, token_counter_js_1.estimateDbMessageTokens)(msg.content, msg.tool_calls);
    }
    if (usedTokens >= budgetTokens) {
        return { toKeep: recentMessages, toCompact: olderMessages };
    }
    var firstUserId = (_a = messages.find(function (m) { return m.role === 'user'; })) === null || _a === void 0 ? void 0 : _a.id;
    var scored = olderMessages.map(function (msg) { return ({
        msg: msg,
        score: scoreMessage(msg, msg.id === firstUserId),
        tokens: (0, token_counter_js_1.estimateDbMessageTokens)(msg.content, msg.tool_calls),
    }); });
    scored.sort(function (a, b) { return b.score - a.score; });
    var remainingBudget = budgetTokens - usedTokens;
    var toKeep = [];
    var toCompact = [];
    var budgetUsed = 0;
    for (var _b = 0, scored_1 = scored; _b < scored_1.length; _b++) {
        var item = scored_1[_b];
        if (budgetUsed + item.tokens <= remainingBudget && item.score >= 0.6) {
            toKeep.push(item.msg);
            budgetUsed += item.tokens;
        }
        else {
            toCompact.push(item.msg);
        }
    }
    toKeep.sort(function (a, b) { return a.id - b.id; });
    return {
        toKeep: __spreadArray(__spreadArray([], toKeep, true), recentMessages, true),
        toCompact: toCompact,
    };
}
function extractToolName(content) {
    var match = content.match(/<tool_result\s+tool="(\w+)"/);
    return match ? match[1] : null;
}
