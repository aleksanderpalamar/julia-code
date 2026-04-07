"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateTokens = estimateTokens;
exports.estimateMessageTokens = estimateMessageTokens;
exports.estimateMessagesTokens = estimateMessagesTokens;
exports.estimateToolSchemaTokens = estimateToolSchemaTokens;
exports.estimateDbMessageTokens = estimateDbMessageTokens;
var MESSAGE_OVERHEAD = 4;
var CHARS_PER_TOKEN = 3.5;
function estimateTokens(text) {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}
function estimateMessageTokens(msg) {
    var chars = msg.content.length;
    if (msg.tool_calls) {
        chars += JSON.stringify(msg.tool_calls).length;
    }
    if (msg.tool_call_id) {
        chars += msg.tool_call_id.length;
    }
    return Math.ceil(chars / CHARS_PER_TOKEN) + MESSAGE_OVERHEAD;
}
function estimateMessagesTokens(messages) {
    var total = 0;
    for (var _i = 0, messages_1 = messages; _i < messages_1.length; _i++) {
        var msg = messages_1[_i];
        total += estimateMessageTokens(msg);
    }
    return total;
}
function estimateToolSchemaTokens(tools) {
    if (tools.length === 0)
        return 0;
    var json = JSON.stringify(tools);
    return Math.ceil(json.length / CHARS_PER_TOKEN);
}
function estimateDbMessageTokens(content, toolCalls) {
    var chars = content.length;
    if (toolCalls)
        chars += toolCalls.length;
    return Math.ceil(chars / CHARS_PER_TOKEN) + MESSAGE_OVERHEAD;
}
