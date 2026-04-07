"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.performStructuredCompaction = performStructuredCompaction;
exports.formatCompactionForContext = formatCompactionForContext;
exports.serializeCompaction = serializeCompaction;
exports.deserializeCompaction = deserializeCompaction;
var registry_js_1 = require("../providers/registry.js");
var token_counter_js_1 = require("./token-counter.js");
var STRUCTURED_COMPACTION_PROMPT = "You are a context compressor for an AI coding assistant. Extract structured information from the conversation below into a JSON object with EXACTLY these fields:\n\n{\n  \"taskGoal\": \"The user's original task or goal\",\n  \"filesRead\": [\"list of file paths that were read\"],\n  \"filesModified\": [\"list of file paths that were written or edited\"],\n  \"decisions\": [\"key decisions made and their rationale\"],\n  \"currentState\": \"what has been accomplished so far\",\n  \"pendingWork\": \"what still needs to be done\",\n  \"keyFacts\": [\"important facts discovered: API endpoints, config values, patterns, etc.\"],\n  \"rawSummary\": \"free-form summary of anything not captured above\"\n}\n\nCRITICAL RULES:\n- Extract ALL file paths from tool calls and results \u2014 do not miss any\n- Preserve ALL decisions and their rationale\n- Identify the user's original goal from the first user message\n- Be specific about what was completed and what remains\n- Output ONLY valid JSON, no markdown, no preamble";
var MERGE_COMPACTION_PROMPT = "You are a context compressor. Merge the following new conversation messages into the existing structured summary. Update all fields as needed \u2014 add new files, decisions, facts. Update currentState and pendingWork. Output ONLY valid JSON with the same structure.\n\nExisting summary:";
function performStructuredCompaction(messages, existingCompaction, model, maxOutputTokens) {
    return __awaiter(this, void 0, void 0, function () {
        var provider, summaryMessages, conversationText, _i, messages_1, msg, prefix, maxInputChars, response, stream, _a, stream_1, stream_1_1, chunk, e_1_1;
        var _b, e_1, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    provider = (0, registry_js_1.getProvider)('ollama');
                    summaryMessages = [];
                    if (existingCompaction) {
                        summaryMessages.push({
                            role: 'system',
                            content: MERGE_COMPACTION_PROMPT,
                        });
                        summaryMessages.push({
                            role: 'user',
                            content: JSON.stringify(existingCompaction, null, 2) + '\n\nNew messages to incorporate:',
                        });
                    }
                    else {
                        summaryMessages.push({
                            role: 'system',
                            content: STRUCTURED_COMPACTION_PROMPT,
                        });
                    }
                    conversationText = '';
                    for (_i = 0, messages_1 = messages; _i < messages_1.length; _i++) {
                        msg = messages_1[_i];
                        prefix = msg.role.toUpperCase();
                        conversationText += "[".concat(prefix, "]: ").concat(msg.content, "\n");
                        if (msg.tool_calls) {
                            conversationText += "[TOOL_CALLS]: ".concat(msg.tool_calls, "\n");
                        }
                    }
                    if (maxOutputTokens) {
                        maxInputChars = maxOutputTokens * 7;
                        if (conversationText.length > maxInputChars) {
                            conversationText = conversationText.slice(0, maxInputChars) + '\n... [truncated for compaction]';
                        }
                    }
                    summaryMessages.push({ role: 'user', content: conversationText });
                    response = '';
                    stream = provider.chat({ model: model, messages: summaryMessages });
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 6, 7, 12]);
                    _a = true, stream_1 = __asyncValues(stream);
                    _e.label = 2;
                case 2: return [4 /*yield*/, stream_1.next()];
                case 3:
                    if (!(stream_1_1 = _e.sent(), _b = stream_1_1.done, !_b)) return [3 /*break*/, 5];
                    _d = stream_1_1.value;
                    _a = false;
                    chunk = _d;
                    if (chunk.type === 'error')
                        return [3 /*break*/, 5];
                    if (chunk.type === 'text' && chunk.text) {
                        response += chunk.text;
                    }
                    _e.label = 4;
                case 4:
                    _a = true;
                    return [3 /*break*/, 2];
                case 5: return [3 /*break*/, 12];
                case 6:
                    e_1_1 = _e.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 12];
                case 7:
                    _e.trys.push([7, , 10, 11]);
                    if (!(!_a && !_b && (_c = stream_1.return))) return [3 /*break*/, 9];
                    return [4 /*yield*/, _c.call(stream_1)];
                case 8:
                    _e.sent();
                    _e.label = 9;
                case 9: return [3 /*break*/, 11];
                case 10:
                    if (e_1) throw e_1.error;
                    return [7 /*endfinally*/];
                case 11: return [7 /*endfinally*/];
                case 12: return [2 /*return*/, parseCompactionResponse(response, existingCompaction)];
            }
        });
    });
}
function parseCompactionResponse(response, existing) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
    var trimmed = response.trim();
    var jsonMatch = (_a = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)) !== null && _a !== void 0 ? _a : [null, trimmed];
    var jsonStr = ((_b = jsonMatch[1]) !== null && _b !== void 0 ? _b : trimmed).trim();
    try {
        var parsed = JSON.parse(jsonStr);
        return {
            taskGoal: (_d = (_c = parsed.taskGoal) !== null && _c !== void 0 ? _c : existing === null || existing === void 0 ? void 0 : existing.taskGoal) !== null && _d !== void 0 ? _d : '',
            filesRead: Array.isArray(parsed.filesRead) ? parsed.filesRead : (_e = existing === null || existing === void 0 ? void 0 : existing.filesRead) !== null && _e !== void 0 ? _e : [],
            filesModified: Array.isArray(parsed.filesModified) ? parsed.filesModified : (_f = existing === null || existing === void 0 ? void 0 : existing.filesModified) !== null && _f !== void 0 ? _f : [],
            decisions: Array.isArray(parsed.decisions) ? parsed.decisions : (_g = existing === null || existing === void 0 ? void 0 : existing.decisions) !== null && _g !== void 0 ? _g : [],
            currentState: (_j = (_h = parsed.currentState) !== null && _h !== void 0 ? _h : existing === null || existing === void 0 ? void 0 : existing.currentState) !== null && _j !== void 0 ? _j : '',
            pendingWork: (_l = (_k = parsed.pendingWork) !== null && _k !== void 0 ? _k : existing === null || existing === void 0 ? void 0 : existing.pendingWork) !== null && _l !== void 0 ? _l : '',
            keyFacts: Array.isArray(parsed.keyFacts) ? parsed.keyFacts : (_m = existing === null || existing === void 0 ? void 0 : existing.keyFacts) !== null && _m !== void 0 ? _m : [],
            rawSummary: (_o = parsed.rawSummary) !== null && _o !== void 0 ? _o : '',
        };
    }
    catch (_w) {
        return {
            taskGoal: (_p = existing === null || existing === void 0 ? void 0 : existing.taskGoal) !== null && _p !== void 0 ? _p : '',
            filesRead: (_q = existing === null || existing === void 0 ? void 0 : existing.filesRead) !== null && _q !== void 0 ? _q : [],
            filesModified: (_r = existing === null || existing === void 0 ? void 0 : existing.filesModified) !== null && _r !== void 0 ? _r : [],
            decisions: (_s = existing === null || existing === void 0 ? void 0 : existing.decisions) !== null && _s !== void 0 ? _s : [],
            currentState: (_t = existing === null || existing === void 0 ? void 0 : existing.currentState) !== null && _t !== void 0 ? _t : '',
            pendingWork: (_u = existing === null || existing === void 0 ? void 0 : existing.pendingWork) !== null && _u !== void 0 ? _u : '',
            keyFacts: (_v = existing === null || existing === void 0 ? void 0 : existing.keyFacts) !== null && _v !== void 0 ? _v : [],
            rawSummary: trimmed,
        };
    }
}
function formatCompactionForContext(compaction, budgetTokens) {
    var sections = [];
    if (compaction.taskGoal) {
        sections.push("**Objetivo:** ".concat(compaction.taskGoal));
    }
    if (compaction.filesModified.length > 0) {
        sections.push("**Arquivos modificados:** ".concat(compaction.filesModified.join(', ')));
    }
    if (compaction.decisions.length > 0) {
        sections.push("**Decis\u00F5es:**\n".concat(compaction.decisions.map(function (d) { return "- ".concat(d); }).join('\n')));
    }
    if (compaction.currentState) {
        sections.push("**Estado atual:** ".concat(compaction.currentState));
    }
    if (compaction.pendingWork) {
        sections.push("**Trabalho pendente:** ".concat(compaction.pendingWork));
    }
    if (compaction.filesRead.length > 0) {
        sections.push("**Arquivos lidos:** ".concat(compaction.filesRead.join(', ')));
    }
    if (compaction.keyFacts.length > 0) {
        sections.push("**Fatos importantes:**\n".concat(compaction.keyFacts.map(function (f) { return "- ".concat(f); }).join('\n')));
    }
    if (compaction.rawSummary) {
        sections.push("**Resumo:** ".concat(compaction.rawSummary));
    }
    var result = '';
    for (var _i = 0, sections_1 = sections; _i < sections_1.length; _i++) {
        var section = sections_1[_i];
        var candidate = result ? result + '\n\n' + section : section;
        if ((0, token_counter_js_1.estimateTokens)(candidate) > budgetTokens)
            break;
        result = candidate;
    }
    return result || compaction.rawSummary.slice(0, budgetTokens * 3);
}
function serializeCompaction(compaction) {
    return JSON.stringify(compaction);
}
function deserializeCompaction(summary, format) {
    if (format === 'structured') {
        try {
            return JSON.parse(summary);
        }
        catch (_a) {
        }
    }
    return {
        taskGoal: '',
        filesRead: [],
        filesModified: [],
        decisions: [],
        currentState: '',
        pendingWork: '',
        keyFacts: [],
        rawSummary: summary,
    };
}
