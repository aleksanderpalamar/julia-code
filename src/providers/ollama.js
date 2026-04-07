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
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaProvider = void 0;
exports.listOllamaModels = listOllamaModels;
exports.listOllamaModelsDetailed = listOllamaModelsDetailed;
var node_crypto_1 = require("node:crypto");
var index_js_1 = require("../config/index.js");
var OllamaProvider = /** @class */ (function () {
    function OllamaProvider() {
        this.name = 'ollama';
    }
    OllamaProvider.prototype.chat = function (params) {
        return __asyncGenerator(this, arguments, function chat_1() {
            var ollamaHost, body, maxRetries, res, _loop_1, attempt, state_1, _a, _b, reader, decoder, buffer, fullText, accumulatedToolCalls, _c, done, value, lines, _i, lines_1, line, chunk, _d, _e, tc, toolCall, fallbackCalls, _f, fallbackCalls_1, tc;
            var _g;
            var _h, _j, _k, _l, _m, _o, _p;
            return __generator(this, function (_q) {
                switch (_q.label) {
                    case 0:
                        ollamaHost = (0, index_js_1.getConfig)().ollamaHost;
                        body = {
                            model: params.model,
                            messages: params.messages.map(formatMessage),
                            stream: true,
                        };
                        if ((_h = params.tools) === null || _h === void 0 ? void 0 : _h.length) {
                            body.tools = params.tools;
                        }
                        maxRetries = 2;
                        res = null;
                        _loop_1 = function (attempt) {
                            return __generator(this, function (_s) {
                                switch (_s.label) {
                                    case 0: return [4 /*yield*/, __await(fetch("".concat(ollamaHost, "/api/chat"), {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify(body),
                                        }))];
                                    case 1:
                                        res = _s.sent();
                                        if (res.ok || res.status < 500)
                                            return [2 /*return*/, "break"];
                                        if (!(attempt < maxRetries)) return [3 /*break*/, 3];
                                        return [4 /*yield*/, __await(new Promise(function (r) { return setTimeout(r, 1000 * (attempt + 1)); }))];
                                    case 2:
                                        _s.sent();
                                        _s.label = 3;
                                    case 3: return [2 /*return*/];
                                }
                            });
                        };
                        attempt = 0;
                        _q.label = 1;
                    case 1:
                        if (!(attempt <= maxRetries)) return [3 /*break*/, 4];
                        return [5 /*yield**/, _loop_1(attempt)];
                    case 2:
                        state_1 = _q.sent();
                        if (state_1 === "break")
                            return [3 /*break*/, 4];
                        _q.label = 3;
                    case 3:
                        attempt++;
                        return [3 /*break*/, 1];
                    case 4:
                        if (!!res.ok) return [3 /*break*/, 9];
                        _g = { type: 'error' };
                        _b = (_a = "Ollama error ".concat(res.status, ": ")).concat;
                        return [4 /*yield*/, __await(res.text())];
                    case 5: return [4 /*yield*/, __await.apply(void 0, [(_g.error = _b.apply(_a, [_q.sent()]), _g)])];
                    case 6: return [4 /*yield*/, _q.sent()];
                    case 7:
                        _q.sent();
                        return [4 /*yield*/, __await(void 0)];
                    case 8: return [2 /*return*/, _q.sent()];
                    case 9:
                        reader = res.body.getReader();
                        decoder = new TextDecoder();
                        buffer = '';
                        fullText = '';
                        accumulatedToolCalls = [];
                        _q.label = 10;
                    case 10:
                        if (!true) return [3 /*break*/, 31];
                        return [4 /*yield*/, __await(reader.read())];
                    case 11:
                        _c = _q.sent(), done = _c.done, value = _c.value;
                        if (done)
                            return [3 /*break*/, 31];
                        buffer += decoder.decode(value, { stream: true });
                        lines = buffer.split('\n');
                        buffer = lines.pop();
                        _i = 0, lines_1 = lines;
                        _q.label = 12;
                    case 12:
                        if (!(_i < lines_1.length)) return [3 /*break*/, 30];
                        line = lines_1[_i];
                        if (!line.trim())
                            return [3 /*break*/, 29];
                        chunk = void 0;
                        try {
                            chunk = JSON.parse(line);
                        }
                        catch (_r) {
                            return [3 /*break*/, 29];
                        }
                        if (!((_k = (_j = chunk.message) === null || _j === void 0 ? void 0 : _j.tool_calls) === null || _k === void 0 ? void 0 : _k.length)) return [3 /*break*/, 17];
                        _d = 0, _e = chunk.message.tool_calls;
                        _q.label = 13;
                    case 13:
                        if (!(_d < _e.length)) return [3 /*break*/, 17];
                        tc = _e[_d];
                        toolCall = {
                            id: (0, node_crypto_1.randomUUID)(),
                            function: {
                                name: tc.function.name,
                                arguments: tc.function.arguments,
                            },
                        };
                        accumulatedToolCalls.push(toolCall);
                        return [4 /*yield*/, __await({ type: 'tool_call', toolCall: toolCall })];
                    case 14: return [4 /*yield*/, _q.sent()];
                    case 15:
                        _q.sent();
                        _q.label = 16;
                    case 16:
                        _d++;
                        return [3 /*break*/, 13];
                    case 17:
                        if (!((_l = chunk.message) === null || _l === void 0 ? void 0 : _l.content)) return [3 /*break*/, 20];
                        fullText += chunk.message.content;
                        return [4 /*yield*/, __await({ type: 'text', text: chunk.message.content })];
                    case 18: return [4 /*yield*/, _q.sent()];
                    case 19:
                        _q.sent();
                        _q.label = 20;
                    case 20:
                        if (!chunk.done) return [3 /*break*/, 29];
                        if (!(accumulatedToolCalls.length === 0 && ((_m = params.tools) === null || _m === void 0 ? void 0 : _m.length))) return [3 /*break*/, 25];
                        fallbackCalls = parseFallbackToolCalls(fullText);
                        _f = 0, fallbackCalls_1 = fallbackCalls;
                        _q.label = 21;
                    case 21:
                        if (!(_f < fallbackCalls_1.length)) return [3 /*break*/, 25];
                        tc = fallbackCalls_1[_f];
                        accumulatedToolCalls.push(tc);
                        return [4 /*yield*/, __await({ type: 'tool_call', toolCall: tc })];
                    case 22: return [4 /*yield*/, _q.sent()];
                    case 23:
                        _q.sent();
                        _q.label = 24;
                    case 24:
                        _f++;
                        return [3 /*break*/, 21];
                    case 25: return [4 /*yield*/, __await({
                            type: 'done',
                            usage: {
                                promptTokens: (_o = chunk.prompt_eval_count) !== null && _o !== void 0 ? _o : 0,
                                completionTokens: (_p = chunk.eval_count) !== null && _p !== void 0 ? _p : 0,
                            },
                        })];
                    case 26: return [4 /*yield*/, _q.sent()];
                    case 27:
                        _q.sent();
                        return [4 /*yield*/, __await(void 0)];
                    case 28: return [2 /*return*/, _q.sent()];
                    case 29:
                        _i++;
                        return [3 /*break*/, 12];
                    case 30: return [3 /*break*/, 10];
                    case 31: return [4 /*yield*/, __await({ type: 'done' })];
                    case 32: return [4 /*yield*/, _q.sent()];
                    case 33:
                        _q.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return OllamaProvider;
}());
exports.OllamaProvider = OllamaProvider;
function formatMessage(msg) {
    var _a, _b;
    var formatted = {
        role: msg.role,
        content: msg.content,
    };
    if ((_a = msg.images) === null || _a === void 0 ? void 0 : _a.length) {
        formatted.images = msg.images;
    }
    if ((_b = msg.tool_calls) === null || _b === void 0 ? void 0 : _b.length) {
        formatted.tool_calls = msg.tool_calls.map(function (tc) { return ({
            function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
            },
        }); });
    }
    return formatted;
}
function parseFallbackToolCalls(text) {
    var calls = parseToolCallJson(text);
    if (calls.length > 0)
        return calls;
    calls = parseFunctionCallsXml(text);
    if (calls.length > 0)
        return calls;
    return [];
}
function parseToolCallJson(text) {
    var _a, _b;
    var calls = [];
    var regex = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;
    var match;
    while ((match = regex.exec(text)) !== null) {
        try {
            var parsed = JSON.parse(match[1]);
            if (parsed.name) {
                calls.push({
                    id: (0, node_crypto_1.randomUUID)(),
                    function: {
                        name: parsed.name,
                        arguments: (_b = (_a = parsed.arguments) !== null && _a !== void 0 ? _a : parsed.args) !== null && _b !== void 0 ? _b : {},
                    },
                });
            }
        }
        catch (_c) {
        }
    }
    return calls;
}
function parseFunctionCallsXml(text) {
    var calls = [];
    var invokeRegex = /<invoke\s+name="([^"]+)">([\s\S]*?)<\/invoke>/g;
    var paramRegex = /<parameter\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/parameter>/g;
    var invokeMatch;
    while ((invokeMatch = invokeRegex.exec(text)) !== null) {
        var name_1 = invokeMatch[1];
        var body = invokeMatch[2];
        var args = {};
        var paramMatch = void 0;
        paramRegex.lastIndex = 0;
        while ((paramMatch = paramRegex.exec(body)) !== null) {
            args[paramMatch[1]] = paramMatch[2].trim();
        }
        calls.push({
            id: (0, node_crypto_1.randomUUID)(),
            function: { name: name_1, arguments: args },
        });
    }
    return calls;
}
function listOllamaModels() {
    return __awaiter(this, void 0, void 0, function () {
        var ollamaHost, res, data, _a;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    ollamaHost = (0, index_js_1.getConfig)().ollamaHost;
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, fetch("".concat(ollamaHost, "/api/tags"))];
                case 2:
                    res = _c.sent();
                    if (!res.ok)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, res.json()];
                case 3:
                    data = _c.sent();
                    return [2 /*return*/, ((_b = data.models) !== null && _b !== void 0 ? _b : []).map(function (m) { return m.name; })];
                case 4:
                    _a = _c.sent();
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function listOllamaModelsDetailed() {
    return __awaiter(this, void 0, void 0, function () {
        var ollamaHost, res, data, _a;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    ollamaHost = (0, index_js_1.getConfig)().ollamaHost;
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, fetch("".concat(ollamaHost, "/api/tags"))];
                case 2:
                    res = _c.sent();
                    if (!res.ok)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, res.json()];
                case 3:
                    data = _c.sent();
                    return [2 /*return*/, (_b = data.models) !== null && _b !== void 0 ? _b : []];
                case 4:
                    _a = _c.sent();
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
