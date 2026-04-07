"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
exports.AgentLoop = void 0;
var node_crypto_1 = require("node:crypto");
var node_events_1 = require("node:events");
var registry_js_1 = require("../providers/registry.js");
var registry_js_2 = require("../tools/registry.js");
var context_js_1 = require("./context.js");
var manager_js_1 = require("../session/manager.js");
var index_js_1 = require("../config/index.js");
var budget_js_1 = require("../context/budget.js");
var compaction_js_1 = require("../context/compaction.js");
var health_js_1 = require("../context/health.js");
var model_info_js_1 = require("../context/model-info.js");
var memory_js_1 = require("../tools/memory.js");
var subagent_js_1 = require("../tools/subagent.js");
var subagent_js_2 = require("./subagent.js");
var ollama_js_1 = require("../providers/ollama.js");
var boundaries_js_1 = require("../security/boundaries.js");
var sanitize_js_1 = require("../security/sanitize.js");
var permissions_js_1 = require("../security/permissions.js");
var AgentLoop = /** @class */ (function (_super) {
    __extends(AgentLoop, _super);
    function AgentLoop(options) {
        var _this = _super.call(this) || this;
        _this.running = false;
        _this.planMode = false;
        _this.temperament = 'neutral';
        _this.approvedAllForSession = false;
        _this.allowRules = [];
        _this.abortController = null;
        _this.options = options !== null && options !== void 0 ? options : {};
        return _this;
    }
    AgentLoop.prototype.abort = function () {
        if (this.abortController) {
            this.abortController.abort();
        }
        this.running = false;
    };
    AgentLoop.prototype.setAllowRules = function (rules) {
        this.allowRules = rules;
    };
    AgentLoop.prototype.setExcludeTools = function (tools) {
        this.options.excludeTools = tools;
    };
    AgentLoop.prototype.setPlanMode = function (enabled) {
        this.planMode = enabled;
    };
    AgentLoop.prototype.setTemperament = function (t) {
        this.temperament = t;
    };
    AgentLoop.prototype.run = function (sessionId, userMessage, model, images) {
        return __awaiter(this, void 0, void 0, function () {
            var config, requestedModel, provider, getAvailableModels, requestedIsCloud, loopModel, auxModel, localToolCapable, toolSchemas, maxIterations, orchestrated, iterations, currentBudget, hasToolModel, switchedToCloud, localHasTools, _a, useLocalFirst, currentModel, currentTools, _b, messages, budget, health, keepCount, rebuilt, fullText, toolCalls, stream, _c, stream_1, stream_1_1, chunk, total, e_1_1, localFailedTools, _i, toolCalls_1, tc, toolName, toolArgs, resultText_1, risk, approved, resultText_2, result, resultText, maxResultChars, capFactor, err_1;
            var _this = this;
            var _d, e_1, _e, _f;
            var _g, _h, _j, _k, _l, _m, _o, _p;
            return __generator(this, function (_q) {
                switch (_q.label) {
                    case 0:
                        if (this.running) {
                            this.emit('error', 'Agent is already running');
                            return [2 /*return*/];
                        }
                        this.running = true;
                        this.abortController = new AbortController();
                        (0, memory_js_1.setCurrentSessionId)(sessionId);
                        (0, subagent_js_1.setSubagentSessionId)(sessionId);
                        config = (0, index_js_1.getConfig)();
                        requestedModel = model !== null && model !== void 0 ? model : config.defaultModel;
                        provider = (0, registry_js_1.getProvider)('ollama');
                        return [4 /*yield*/, Promise.resolve().then(function () { return require('../config/mcp.js'); })];
                    case 1:
                        getAvailableModels = (_q.sent()).getAvailableModels;
                        requestedIsCloud = (_h = (_g = getAvailableModels().find(function (m) { return m.id === requestedModel; })) === null || _g === void 0 ? void 0 : _g.isCloud) !== null && _h !== void 0 ? _h : false;
                        loopModel = (_j = (requestedIsCloud ? null : config.toolModel)) !== null && _j !== void 0 ? _j : requestedModel;
                        auxModel = requestedModel;
                        return [4 /*yield*/, (0, model_info_js_1.supportsTools)(requestedModel)];
                    case 2:
                        localToolCapable = _q.sent();
                        if (loopModel !== requestedModel && !localToolCapable) {
                            this.emit('model_switch', loopModel);
                        }
                        toolSchemas = (0, registry_js_2.getToolSchemas)();
                        if ((_k = this.options.excludeTools) === null || _k === void 0 ? void 0 : _k.length) {
                            toolSchemas = toolSchemas.filter(function (s) { return !_this.options.excludeTools.includes(s.function.name); });
                        }
                        maxIterations = (_l = this.options.maxIterations) !== null && _l !== void 0 ? _l : config.maxToolIterations;
                        _q.label = 3;
                    case 3:
                        _q.trys.push([3, 34, 35, 36]);
                        (0, manager_js_1.addMessage)(sessionId, 'user', userMessage, undefined, undefined, images);
                        this.emit('thinking');
                        if (!(config.acpEnabled && config.acpAutoOrchestrate && !((_m = this.options.excludeTools) === null || _m === void 0 ? void 0 : _m.includes('subagent')))) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.maybeOrchestrate(sessionId, userMessage, auxModel)];
                    case 4:
                        orchestrated = _q.sent();
                        if (orchestrated) {
                            this.running = false;
                            return [2 /*return*/];
                        }
                        _q.label = 5;
                    case 5: return [4 /*yield*/, this.maybeCompact(sessionId, auxModel)];
                    case 6:
                        _q.sent();
                        iterations = 0;
                        currentBudget = null;
                        hasToolModel = loopModel !== auxModel;
                        switchedToCloud = false;
                        if (!hasToolModel) return [3 /*break*/, 8];
                        return [4 /*yield*/, (0, model_info_js_1.supportsTools)(auxModel)];
                    case 7:
                        _a = _q.sent();
                        return [3 /*break*/, 9];
                    case 8:
                        _a = false;
                        _q.label = 9;
                    case 9:
                        localHasTools = _a;
                        _q.label = 10;
                    case 10:
                        if (!(iterations < maxIterations)) return [3 /*break*/, 33];
                        if ((_o = this.abortController) === null || _o === void 0 ? void 0 : _o.signal.aborted) {
                            this.emit('error', 'Aborted');
                            this.running = false;
                            return [2 /*return*/];
                        }
                        iterations++;
                        this.emit('thinking');
                        useLocalFirst = iterations === 1 && hasToolModel && !localHasTools && !switchedToCloud;
                        currentModel = switchedToCloud ? loopModel
                            : (useLocalFirst ? auxModel : (localHasTools ? auxModel : loopModel));
                        currentTools = useLocalFirst ? undefined : toolSchemas;
                        return [4 /*yield*/, (0, context_js_1.buildContext)(sessionId, currentModel, {
                                planMode: this.planMode,
                                temperament: this.temperament,
                                iteration: iterations,
                                maxIterations: maxIterations,
                            })];
                    case 11:
                        _b = _q.sent(), messages = _b.messages, budget = _b.budget, health = _b.health;
                        currentBudget = budget;
                        this.emit('context_health', health);
                        if (!(0, health_js_1.shouldEmergencyCompact)(health)) return [3 /*break*/, 14];
                        this.emit('compacting');
                        keepCount = (0, health_js_1.getEmergencyKeepCount)(health);
                        return [4 /*yield*/, this.performEmergencyCompaction(sessionId, auxModel, keepCount)];
                    case 12:
                        _q.sent();
                        return [4 /*yield*/, (0, context_js_1.buildContext)(sessionId, currentModel, {
                                planMode: this.planMode,
                                temperament: this.temperament,
                                iteration: iterations,
                                maxIterations: maxIterations,
                            })];
                    case 13:
                        rebuilt = _q.sent();
                        this.emit('context_health', rebuilt.health);
                        messages.length = 0;
                        messages.push.apply(messages, rebuilt.messages);
                        _q.label = 14;
                    case 14:
                        fullText = '';
                        toolCalls = [];
                        stream = provider.chat({
                            model: currentModel,
                            messages: messages,
                            tools: currentTools,
                        });
                        _q.label = 15;
                    case 15:
                        _q.trys.push([15, 20, 21, 26]);
                        _c = true, stream_1 = (e_1 = void 0, __asyncValues(stream));
                        _q.label = 16;
                    case 16: return [4 /*yield*/, stream_1.next()];
                    case 17:
                        if (!(stream_1_1 = _q.sent(), _d = stream_1_1.done, !_d)) return [3 /*break*/, 19];
                        _f = stream_1_1.value;
                        _c = false;
                        chunk = _f;
                        switch (chunk.type) {
                            case 'text':
                                fullText += chunk.text;
                                this.emit('chunk', chunk.text);
                                break;
                            case 'tool_call':
                                toolCalls.push(chunk.toolCall);
                                this.emit('tool_call', chunk.toolCall);
                                break;
                            case 'done':
                                if (chunk.usage) {
                                    total = chunk.usage.promptTokens + chunk.usage.completionTokens;
                                    (0, manager_js_1.addSessionTokens)(sessionId, total);
                                    this.emit('usage', chunk.usage);
                                }
                                break;
                            case 'error':
                                this.emit('error', chunk.error);
                                this.running = false;
                                return [2 /*return*/];
                        }
                        _q.label = 18;
                    case 18:
                        _c = true;
                        return [3 /*break*/, 16];
                    case 19: return [3 /*break*/, 26];
                    case 20:
                        e_1_1 = _q.sent();
                        e_1 = { error: e_1_1 };
                        return [3 /*break*/, 26];
                    case 21:
                        _q.trys.push([21, , 24, 25]);
                        if (!(!_c && !_d && (_e = stream_1.return))) return [3 /*break*/, 23];
                        return [4 /*yield*/, _e.call(stream_1)];
                    case 22:
                        _q.sent();
                        _q.label = 23;
                    case 23: return [3 /*break*/, 25];
                    case 24:
                        if (e_1) throw e_1.error;
                        return [7 /*endfinally*/];
                    case 25: return [7 /*endfinally*/];
                    case 26:
                        localFailedTools = localHasTools && hasToolModel && !switchedToCloud
                            && toolCalls.length === 0 && needsToolCalling(fullText);
                        if ((useLocalFirst || localFailedTools) && toolCalls.length === 0 && needsToolCalling(fullText)) {
                            this.emit('clear_streaming');
                            switchedToCloud = true;
                            this.emit('chunk', "\uD83D\uDD04 Trocando para ".concat(loopModel, " para executar ferramentas...\n\n"));
                            this.emit('model_switch', loopModel);
                            return [3 /*break*/, 10];
                        }
                        (0, manager_js_1.addMessage)(sessionId, 'assistant', fullText, toolCalls.length > 0 ? toolCalls : undefined);
                        if (toolCalls.length === 0) {
                            this.emit('done', fullText);
                            this.maybeGenerateTitle(sessionId, auxModel, userMessage, fullText);
                            this.running = false;
                            return [2 /*return*/];
                        }
                        _i = 0, toolCalls_1 = toolCalls;
                        _q.label = 27;
                    case 27:
                        if (!(_i < toolCalls_1.length)) return [3 /*break*/, 32];
                        tc = toolCalls_1[_i];
                        if ((_p = this.abortController) === null || _p === void 0 ? void 0 : _p.signal.aborted) {
                            this.emit('error', 'Aborted');
                            this.running = false;
                            return [2 /*return*/];
                        }
                        toolName = tc.function.name;
                        toolArgs = tc.function.arguments;
                        if (toolName === 'exec' && (0, permissions_js_1.isBlockedCommand)(toolArgs.command)) {
                            resultText_1 = 'Operação bloqueada: este comando está na blocklist de segurança.';
                            (0, manager_js_1.addMessage)(sessionId, 'tool', resultText_1, undefined, tc.id);
                            this.emit('tool_result', toolName, resultText_1, false);
                            return [3 /*break*/, 31];
                        }
                        risk = (0, permissions_js_1.getToolRisk)(toolName);
                        if (!(risk === 'dangerous' && !this.approvedAllForSession)) return [3 /*break*/, 29];
                        if (!!(0, permissions_js_1.matchesAllowRule)(toolName, toolArgs, this.allowRules)) return [3 /*break*/, 29];
                        return [4 /*yield*/, this.requestApproval(toolName, toolArgs)];
                    case 28:
                        approved = _q.sent();
                        if (approved === 'deny') {
                            resultText_2 = 'Operação negada pelo usuário.';
                            (0, manager_js_1.addMessage)(sessionId, 'tool', resultText_2, undefined, tc.id);
                            this.emit('tool_result', toolName, resultText_2, false);
                            return [3 /*break*/, 31];
                        }
                        if (approved === 'approve_all') {
                            this.approvedAllForSession = true;
                        }
                        _q.label = 29;
                    case 29: return [4 /*yield*/, (0, registry_js_2.executeTool)(toolName, toolArgs)];
                    case 30:
                        result = _q.sent();
                        resultText = result.success
                            ? result.output
                            : "Error: ".concat(result.error, "\n").concat(result.output);
                        maxResultChars = 12000;
                        if (currentBudget) {
                            maxResultChars = (0, budget_js_1.computeToolResultCap)(currentBudget, toolName);
                            capFactor = (0, health_js_1.getToolResultCapFactor)(health);
                            maxResultChars = Math.floor(maxResultChars * capFactor);
                        }
                        if (resultText.length > maxResultChars) {
                            resultText = resultText.slice(0, maxResultChars) + '\n... [truncated — use offset/limit for large files]';
                        }
                        resultText = (0, sanitize_js_1.sanitizeToolResult)(resultText);
                        resultText = (0, boundaries_js_1.wrapToolResult)(toolName, resultText);
                        (0, manager_js_1.addMessage)(sessionId, 'tool', resultText, undefined, tc.id);
                        this.emit('tool_result', toolName, resultText, result.success);
                        _q.label = 31;
                    case 31:
                        _i++;
                        return [3 /*break*/, 27];
                    case 32: return [3 /*break*/, 10];
                    case 33:
                        (0, manager_js_1.addMessage)(sessionId, 'assistant', '[Max tool iterations reached]');
                        this.emit('done', '[Max tool iterations reached]');
                        return [3 /*break*/, 36];
                    case 34:
                        err_1 = _q.sent();
                        this.emit('error', err_1 instanceof Error ? err_1.message : String(err_1));
                        return [3 /*break*/, 36];
                    case 35:
                        this.running = false;
                        return [7 /*endfinally*/];
                    case 36: return [2 /*return*/];
                }
            });
        });
    };
    AgentLoop.prototype.requestApproval = function (toolName, args) {
        var _this = this;
        return new Promise(function (resolve) {
            if (_this.listenerCount('approval_needed') === 0) {
                resolve('approve');
                return;
            }
            _this.emit('approval_needed', toolName, args, function (result) {
                resolve(result);
            });
        });
    };
    AgentLoop.prototype.maybeOrchestrate = function (sessionId, userMessage, model) {
        return __awaiter(this, void 0, void 0, function () {
            var provider, availableModels, modelsInfo, messages, response, stream, _a, stream_2, stream_2_1, chunk, e_2_1, analysis_1, _loop_1, _i, _b, sub, runId_1, orchestrationStart, manager_1, subtaskDescriptors, taskLabels_1, spawnedTaskIds_1, onSubagentChunk, onSubagentStarted, onSubagentCompleted, onSubagentFailed, total_1, progressCompleted_1, progressFailed_1, emitProgress_1, onTaskStarted, onTaskCompleted, onTaskFailed, taskIds_1, i, sub, label, resultLines_1, taskIdToIndex_1, earlyCompleted_1, earlyFailed_1, results, orchestrationDuration, allDone, completed, failed, synthesisText, synthesisMessages, synthStream, _c, synthStream_1, synthStream_1_1, chunk, totalTokens, e_3_1, _d, allResultsText, fullOutput, err_2;
            var _this = this;
            var _e, e_2, _f, _g, _h, e_3, _j, _k;
            var _l;
            return __generator(this, function (_m) {
                switch (_m.label) {
                    case 0:
                        _m.trys.push([0, 31, , 32]);
                        provider = (0, registry_js_1.getProvider)('ollama');
                        return [4 /*yield*/, (0, ollama_js_1.listOllamaModels)()];
                    case 1:
                        availableModels = _m.sent();
                        modelsInfo = availableModels.length > 0
                            ? "Available models: ".concat(availableModels.join(', '))
                            : 'No model list available — use null for model to use the default.';
                        messages = [
                            {
                                role: 'system',
                                content: "You are a task complexity analyzer. Given a user task, decide if it should be split into independent subtasks that can run in parallel.\n\nRules:\n- Only split if the task has 2+ CLEARLY INDEPENDENT parts that don't depend on each other\n- Simple tasks (questions, single file edits, explanations, quick fixes) \u2192 NOT complex\n- Tasks with sequential dependencies \u2192 NOT complex\n- Large refactors, multi-file creation, testing multiple modules, batch operations \u2192 complex\n\n".concat(modelsInfo, "\n\nYou can assign different models to subtasks based on their nature:\n- Use larger/stronger models for complex coding tasks\n- Use smaller/faster models for simple file operations or text generation\n- Use null to use the default model\n- IMPORTANT: You MUST use the EXACT full model name as it appears in the available models list above (including the tag after the colon). Do NOT abbreviate or truncate model names.\n\nRespond with ONLY valid JSON, no markdown, no explanation:\n{\"complex\": false}\n\nOR if complex:\n{\"complex\": true, \"subtasks\": [{\"task\": \"detailed description of subtask 1\", \"model\": \"model-name or null\"}, ...]}\n\nEach subtask description must be self-contained with ALL context needed (file paths, requirements, style). The subagent will NOT see the original conversation."),
                            },
                            {
                                role: 'user',
                                content: userMessage,
                            },
                        ];
                        response = '';
                        stream = provider.chat({ model: model, messages: messages });
                        _m.label = 2;
                    case 2:
                        _m.trys.push([2, 7, 8, 13]);
                        _a = true, stream_2 = __asyncValues(stream);
                        _m.label = 3;
                    case 3: return [4 /*yield*/, stream_2.next()];
                    case 4:
                        if (!(stream_2_1 = _m.sent(), _e = stream_2_1.done, !_e)) return [3 /*break*/, 6];
                        _g = stream_2_1.value;
                        _a = false;
                        chunk = _g;
                        if (chunk.type === 'error')
                            return [2 /*return*/, false];
                        if (chunk.type === 'text' && chunk.text) {
                            response += chunk.text;
                        }
                        _m.label = 5;
                    case 5:
                        _a = true;
                        return [3 /*break*/, 3];
                    case 6: return [3 /*break*/, 13];
                    case 7:
                        e_2_1 = _m.sent();
                        e_2 = { error: e_2_1 };
                        return [3 /*break*/, 13];
                    case 8:
                        _m.trys.push([8, , 11, 12]);
                        if (!(!_a && !_e && (_f = stream_2.return))) return [3 /*break*/, 10];
                        return [4 /*yield*/, _f.call(stream_2)];
                    case 9:
                        _m.sent();
                        _m.label = 10;
                    case 10: return [3 /*break*/, 12];
                    case 11:
                        if (e_2) throw e_2.error;
                        return [7 /*endfinally*/];
                    case 12: return [7 /*endfinally*/];
                    case 13:
                        response = response.trim();
                        if (response.startsWith('```')) {
                            response = response.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
                        }
                        try {
                            analysis_1 = JSON.parse(response);
                        }
                        catch (_o) {
                            return [2 /*return*/, false];
                        }
                        if (!analysis_1.complex || !((_l = analysis_1.subtasks) === null || _l === void 0 ? void 0 : _l.length)) {
                            return [2 /*return*/, false];
                        }
                        if (availableModels.length > 0) {
                            _loop_1 = function (sub) {
                                if (sub.model && sub.model !== 'null') {
                                    if (!availableModels.includes(sub.model)) {
                                        var match = availableModels.find(function (m) { return m.startsWith(sub.model + ':') || m === sub.model; });
                                        if (match) {
                                            sub.model = match;
                                        }
                                        else {
                                            sub.model = null;
                                        }
                                    }
                                }
                            };
                            for (_i = 0, _b = analysis_1.subtasks; _i < _b.length; _i++) {
                                sub = _b[_i];
                                _loop_1(sub);
                            }
                        }
                        runId_1 = (0, node_crypto_1.randomUUID)();
                        orchestrationStart = Date.now();
                        (0, manager_js_1.createOrchestrationRun)(runId_1, sessionId, userMessage, analysis_1.subtasks.length);
                        this.emit('chunk', "\uD83D\uDD00 Tarefa complexa detectada \u2014 spawnando ".concat(analysis_1.subtasks.length, " subagentes... (run: ").concat(runId_1.slice(0, 8), ")\n\n"));
                        manager_1 = (0, subagent_js_2.getSubagentManager)();
                        manager_1.prewarm(analysis_1.subtasks.length);
                        subtaskDescriptors = analysis_1.subtasks.map(function (sub) { return ({
                            task: sub.task,
                            model: (sub.model && sub.model !== 'null') ? sub.model : undefined,
                        }); });
                        taskLabels_1 = new Map();
                        spawnedTaskIds_1 = new Set();
                        onSubagentChunk = function (taskId, text) {
                            var _a;
                            if (!spawnedTaskIds_1.has(taskId))
                                return;
                            var label = (_a = taskLabels_1.get(taskId)) !== null && _a !== void 0 ? _a : 'subagent';
                            _this.emit('subagent_chunk', taskId, label, text);
                        };
                        onSubagentStarted = function (taskId) {
                            var _a;
                            if (!spawnedTaskIds_1.has(taskId))
                                return;
                            var label = (_a = taskLabels_1.get(taskId)) !== null && _a !== void 0 ? _a : 'subagent';
                            _this.emit('subagent_status', taskId, label, 'started');
                        };
                        onSubagentCompleted = function (taskId) {
                            var _a;
                            if (!spawnedTaskIds_1.has(taskId))
                                return;
                            var label = (_a = taskLabels_1.get(taskId)) !== null && _a !== void 0 ? _a : 'subagent';
                            var task = manager_1.getTask(taskId);
                            _this.emit('subagent_status', taskId, label, 'completed', task === null || task === void 0 ? void 0 : task.durationMs);
                        };
                        onSubagentFailed = function (taskId) {
                            var _a;
                            if (!spawnedTaskIds_1.has(taskId))
                                return;
                            var label = (_a = taskLabels_1.get(taskId)) !== null && _a !== void 0 ? _a : 'subagent';
                            var task = manager_1.getTask(taskId);
                            _this.emit('subagent_status', taskId, label, 'failed', task === null || task === void 0 ? void 0 : task.durationMs);
                        };
                        total_1 = analysis_1.subtasks.length;
                        progressCompleted_1 = 0;
                        progressFailed_1 = 0;
                        emitProgress_1 = function () {
                            var ids = Array.from(spawnedTaskIds_1);
                            var running = ids.filter(function (id) {
                                var t = manager_1.getTask(id);
                                return (t === null || t === void 0 ? void 0 : t.status) === 'running';
                            }).length;
                            var queued = ids.filter(function (id) {
                                var t = manager_1.getTask(id);
                                return (t === null || t === void 0 ? void 0 : t.status) === 'queued';
                            }).length;
                            _this.emit('orchestration_progress', {
                                runId: runId_1,
                                total: total_1,
                                completed: progressCompleted_1,
                                failed: progressFailed_1,
                                running: running,
                                queued: queued,
                            });
                        };
                        onTaskStarted = function (taskId) {
                            if (!spawnedTaskIds_1.has(taskId))
                                return;
                            emitProgress_1();
                        };
                        onTaskCompleted = function (taskId) {
                            if (!spawnedTaskIds_1.has(taskId))
                                return;
                            progressCompleted_1++;
                            emitProgress_1();
                        };
                        onTaskFailed = function (taskId) {
                            if (!spawnedTaskIds_1.has(taskId))
                                return;
                            progressFailed_1++;
                            emitProgress_1();
                        };
                        manager_1.on('task:chunk', onSubagentChunk);
                        manager_1.on('task:started', onSubagentStarted);
                        manager_1.on('task:completed', onSubagentCompleted);
                        manager_1.on('task:failed', onSubagentFailed);
                        manager_1.on('task:started', onTaskStarted);
                        manager_1.on('task:completed', onTaskCompleted);
                        manager_1.on('task:failed', onTaskFailed);
                        return [4 /*yield*/, manager_1.spawnMany(sessionId, subtaskDescriptors, runId_1)];
                    case 14:
                        taskIds_1 = _m.sent();
                        for (i = 0; i < analysis_1.subtasks.length; i++) {
                            sub = analysis_1.subtasks[i];
                            label = sub.task.slice(0, 60).replace(/\n/g, ' ');
                            taskLabels_1.set(taskIds_1[i], label);
                            spawnedTaskIds_1.add(taskIds_1[i]);
                            this.emit('chunk', "  \u2192 Subagente: ".concat(sub.task.slice(0, 80)).concat(sub.model ? " [".concat(sub.model, "]") : '', "\n"));
                        }
                        this.emit('chunk', "\n\u23F3 Aguardando ".concat(taskIds_1.length, " subagentes...\n"));
                        emitProgress_1();
                        resultLines_1 = [];
                        taskIdToIndex_1 = new Map(taskIds_1.map(function (id, i) { return [id, i]; }));
                        earlyCompleted_1 = 0;
                        earlyFailed_1 = 0;
                        return [4 /*yield*/, new Promise(function (resolveAll) {
                                var seen = new Set();
                                var onEarlyResult = function (taskId) {
                                    var _a, _b, _c, _d;
                                    if (!taskIds_1.includes(taskId))
                                        return;
                                    if (seen.has(taskId))
                                        return;
                                    seen.add(taskId);
                                    var task = manager_1.getTask(taskId);
                                    var idx = taskIdToIndex_1.get(taskId);
                                    var subDesc = (_b = (_a = analysis_1.subtasks[idx]) === null || _a === void 0 ? void 0 : _a.task.slice(0, 60)) !== null && _b !== void 0 ? _b : "subtask ".concat(idx + 1);
                                    if (task.status === 'completed') {
                                        earlyCompleted_1++;
                                        var line = "### Subtask ".concat(idx + 1, ": ").concat(subDesc, "\n").concat((_c = task.result) !== null && _c !== void 0 ? _c : '(no output)');
                                        resultLines_1[idx] = line;
                                        _this.emit('chunk', "\n".concat(line, "\n"));
                                    }
                                    else {
                                        earlyFailed_1++;
                                        var line = "### Subtask ".concat(idx + 1, ": ").concat(subDesc, "\n\u274C Failed: ").concat((_d = task.error) !== null && _d !== void 0 ? _d : 'unknown error');
                                        resultLines_1[idx] = line;
                                        _this.emit('chunk', "\n".concat(line, "\n"));
                                    }
                                    if (seen.size === taskIds_1.length) {
                                        manager_1.off('task:completed', onEarlyResult);
                                        manager_1.off('task:failed', onEarlyResult);
                                        resolveAll(taskIds_1.map(function (id) { return manager_1.getTask(id); }));
                                    }
                                };
                                manager_1.on('task:completed', onEarlyResult);
                                manager_1.on('task:failed', onEarlyResult);
                                for (var _i = 0, taskIds_2 = taskIds_1; _i < taskIds_2.length; _i++) {
                                    var id = taskIds_2[_i];
                                    var t = manager_1.getTask(id);
                                    if (t && (t.status === 'completed' || t.status === 'failed')) {
                                        onEarlyResult(id);
                                    }
                                }
                            })];
                    case 15:
                        results = _m.sent();
                        manager_1.off('task:started', onTaskStarted);
                        manager_1.off('task:completed', onTaskCompleted);
                        manager_1.off('task:failed', onTaskFailed);
                        manager_1.off('task:chunk', onSubagentChunk);
                        manager_1.off('task:started', onSubagentStarted);
                        manager_1.off('task:completed', onSubagentCompleted);
                        manager_1.off('task:failed', onSubagentFailed);
                        orchestrationDuration = Date.now() - orchestrationStart;
                        allDone = results.every(function (r) { return r.status === 'completed'; });
                        (0, manager_js_1.completeOrchestrationRun)(runId_1, allDone ? 'completed' : 'failed', orchestrationDuration);
                        completed = earlyCompleted_1;
                        failed = earlyFailed_1;
                        this.emit('chunk', "\n\u2705 ".concat(completed, " completados, ").concat(failed > 0 ? "\u274C ".concat(failed, " falharam") : 'nenhuma falha', "\n\n"));
                        synthesisText = '';
                        if (!(failed > 0)) return [3 /*break*/, 30];
                        _m.label = 16;
                    case 16:
                        _m.trys.push([16, 29, , 30]);
                        synthesisMessages = [
                            {
                                role: 'system',
                                content: 'You are a helpful assistant. The user gave a task that was split into subtasks and executed in parallel by subagents. Some subtasks failed. Briefly explain what succeeded and what went wrong, and suggest how to fix the failures. Be concise and direct. Respond in the same language the user used.',
                            },
                            {
                                role: 'user',
                                content: "Original request: \"".concat(userMessage, "\"\n\nSubagent results:\n\n").concat(resultLines_1.filter(Boolean).join('\n\n---\n\n')),
                            },
                        ];
                        synthStream = provider.chat({
                            model: model,
                            messages: synthesisMessages,
                        });
                        _m.label = 17;
                    case 17:
                        _m.trys.push([17, 22, 23, 28]);
                        _c = true, synthStream_1 = __asyncValues(synthStream);
                        _m.label = 18;
                    case 18: return [4 /*yield*/, synthStream_1.next()];
                    case 19:
                        if (!(synthStream_1_1 = _m.sent(), _h = synthStream_1_1.done, !_h)) return [3 /*break*/, 21];
                        _k = synthStream_1_1.value;
                        _c = false;
                        chunk = _k;
                        if (chunk.type === 'text' && chunk.text) {
                            synthesisText += chunk.text;
                            this.emit('chunk', chunk.text);
                        }
                        if (chunk.type === 'done' && chunk.usage) {
                            totalTokens = chunk.usage.promptTokens + chunk.usage.completionTokens;
                            (0, manager_js_1.addSessionTokens)(sessionId, totalTokens);
                            this.emit('usage', chunk.usage);
                        }
                        if (chunk.type === 'error') {
                            return [3 /*break*/, 21];
                        }
                        _m.label = 20;
                    case 20:
                        _c = true;
                        return [3 /*break*/, 18];
                    case 21: return [3 /*break*/, 28];
                    case 22:
                        e_3_1 = _m.sent();
                        e_3 = { error: e_3_1 };
                        return [3 /*break*/, 28];
                    case 23:
                        _m.trys.push([23, , 26, 27]);
                        if (!(!_c && !_h && (_j = synthStream_1.return))) return [3 /*break*/, 25];
                        return [4 /*yield*/, _j.call(synthStream_1)];
                    case 24:
                        _m.sent();
                        _m.label = 25;
                    case 25: return [3 /*break*/, 27];
                    case 26:
                        if (e_3) throw e_3.error;
                        return [7 /*endfinally*/];
                    case 27: return [7 /*endfinally*/];
                    case 28: return [3 /*break*/, 30];
                    case 29:
                        _d = _m.sent();
                        return [3 /*break*/, 30];
                    case 30:
                        allResultsText = resultLines_1.filter(Boolean).join('\n\n---\n\n');
                        fullOutput = "\uD83D\uDD00 ".concat(analysis_1.subtasks.length, " subagentes executados (").concat(completed, " ok, ").concat(failed, " falhas)\n\n").concat(allResultsText).concat(synthesisText ? '\n\n' + synthesisText : '');
                        (0, manager_js_1.addMessage)(sessionId, 'assistant', fullOutput);
                        this.emit('done', fullOutput);
                        this.maybeGenerateTitle(sessionId, model, userMessage, allResultsText.slice(0, 500));
                        return [2 /*return*/, true];
                    case 31:
                        err_2 = _m.sent();
                        return [2 /*return*/, false];
                    case 32: return [2 /*return*/];
                }
            });
        });
    };
    AgentLoop.prototype.maybeGenerateTitle = function (sessionId, model, userMessage, assistantReply) {
        return __awaiter(this, void 0, void 0, function () {
            var session, count, provider, messages, title, stream, _a, stream_3, stream_3_1, chunk, e_4_1, _b;
            var _c, e_4, _d, _e;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        _f.trys.push([0, 13, , 14]);
                        session = (0, manager_js_1.getSession)(sessionId);
                        if (!session || session.title !== 'New Session')
                            return [2 /*return*/];
                        count = (0, manager_js_1.getMessageCount)(sessionId);
                        if (count > 4)
                            return [2 /*return*/];
                        provider = (0, registry_js_1.getProvider)('ollama');
                        messages = [
                            {
                                role: 'system',
                                content: 'Generate a short title (max 6 words) for this conversation. Output ONLY the title, nothing else. No quotes, no punctuation at the end.',
                            },
                            {
                                role: 'user',
                                content: "User: ".concat(userMessage, "\nAssistant: ").concat(assistantReply.slice(0, 300)),
                            },
                        ];
                        title = '';
                        stream = provider.chat({ model: model, messages: messages });
                        _f.label = 1;
                    case 1:
                        _f.trys.push([1, 6, 7, 12]);
                        _a = true, stream_3 = __asyncValues(stream);
                        _f.label = 2;
                    case 2: return [4 /*yield*/, stream_3.next()];
                    case 3:
                        if (!(stream_3_1 = _f.sent(), _c = stream_3_1.done, !_c)) return [3 /*break*/, 5];
                        _e = stream_3_1.value;
                        _a = false;
                        chunk = _e;
                        if (chunk.type === 'error')
                            return [2 /*return*/];
                        if (chunk.type === 'text' && chunk.text) {
                            title += chunk.text;
                        }
                        _f.label = 4;
                    case 4:
                        _a = true;
                        return [3 /*break*/, 2];
                    case 5: return [3 /*break*/, 12];
                    case 6:
                        e_4_1 = _f.sent();
                        e_4 = { error: e_4_1 };
                        return [3 /*break*/, 12];
                    case 7:
                        _f.trys.push([7, , 10, 11]);
                        if (!(!_a && !_c && (_d = stream_3.return))) return [3 /*break*/, 9];
                        return [4 /*yield*/, _d.call(stream_3)];
                    case 8:
                        _f.sent();
                        _f.label = 9;
                    case 9: return [3 /*break*/, 11];
                    case 10:
                        if (e_4) throw e_4.error;
                        return [7 /*endfinally*/];
                    case 11: return [7 /*endfinally*/];
                    case 12:
                        title = title.trim().replace(/^["']|["']$/g, '').slice(0, 80);
                        if (title) {
                            (0, manager_js_1.updateSessionTitle)(sessionId, title);
                            this.emit('title', title);
                        }
                        return [3 /*break*/, 14];
                    case 13:
                        _b = _f.sent();
                        return [3 /*break*/, 14];
                    case 14: return [2 /*return*/];
                }
            });
        });
    };
    AgentLoop.prototype.maybeCompact = function (sessionId, model) {
        return __awaiter(this, void 0, void 0, function () {
            var compactable, existingCompaction, existingStructured, structured, summary, startId, _a;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, (0, context_js_1.getCompactableMessages)(sessionId, model)];
                    case 1:
                        compactable = _c.sent();
                        if (!compactable)
                            return [2 /*return*/];
                        this.emit('compacting');
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 4, , 5]);
                        existingCompaction = (0, manager_js_1.getLatestCompaction)(sessionId);
                        existingStructured = null;
                        if (existingCompaction) {
                            existingStructured = (0, compaction_js_1.deserializeCompaction)(existingCompaction.summary, existingCompaction.format);
                        }
                        return [4 /*yield*/, (0, compaction_js_1.performStructuredCompaction)(compactable.messages, existingStructured, model)];
                    case 3:
                        structured = _c.sent();
                        summary = (0, compaction_js_1.serializeCompaction)(structured);
                        if (summary) {
                            startId = (_b = existingCompaction === null || existingCompaction === void 0 ? void 0 : existingCompaction.messages_end) !== null && _b !== void 0 ? _b : 0;
                            (0, manager_js_1.saveCompaction)(sessionId, summary, startId, compactable.lastId, 'structured');
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        _a = _c.sent();
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    AgentLoop.prototype.performEmergencyCompaction = function (sessionId, model, keepCount) {
        return __awaiter(this, void 0, void 0, function () {
            var compactable, existingCompaction, existingStructured, structured, summary, startId, _a;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, (0, context_js_1.getEmergencyCompactableMessages)(sessionId, model, keepCount)];
                    case 1:
                        compactable = _c.sent();
                        if (!compactable)
                            return [2 /*return*/];
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 4, , 5]);
                        existingCompaction = (0, manager_js_1.getLatestCompaction)(sessionId);
                        existingStructured = null;
                        if (existingCompaction) {
                            existingStructured = (0, compaction_js_1.deserializeCompaction)(existingCompaction.summary, existingCompaction.format);
                        }
                        return [4 /*yield*/, (0, compaction_js_1.performStructuredCompaction)(compactable.messages, existingStructured, model)];
                    case 3:
                        structured = _c.sent();
                        summary = (0, compaction_js_1.serializeCompaction)(structured);
                        if (summary) {
                            startId = (_b = existingCompaction === null || existingCompaction === void 0 ? void 0 : existingCompaction.messages_end) !== null && _b !== void 0 ? _b : 0;
                            (0, manager_js_1.saveCompaction)(sessionId, summary, startId, compactable.lastId, 'structured');
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        _a = _c.sent();
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    AgentLoop.prototype.isRunning = function () {
        return this.running;
    };
    return AgentLoop;
}(node_events_1.EventEmitter));
exports.AgentLoop = AgentLoop;
function needsToolCalling(text) {
    var lower = text.toLowerCase();
    var refusalIndicators = [
        'não consigo acessar', 'não consigo executar', 'não consigo rodar',
        'não tenho acesso', 'não posso executar', 'não posso rodar',
        'não posso ler', 'não consigo ler', 'não consigo listar',
        'não tenho capacidade', 'não consigo verificar', 'não tenho como',
        'não posso acessar', 'sem acesso ao', 'sem acesso a ',
        'não consigo criar', 'não consigo escrever', 'não posso criar',
        'você pode executar', 'execute o comando', 'rode o comando',
        'tente rodar', 'você pode rodar', 'você pode usar o comando',
        'i cannot access', 'i cannot execute', 'i cannot read', 'i cannot run',
        'i don\'t have access', 'i can\'t access', 'i can\'t read',
        'i can\'t execute', 'i can\'t run', 'i can\'t list',
        'i can\'t create', 'i can\'t write',
        'you can run', 'try running', 'you could run',
        'unable to execute', 'unable to run', 'unable to access',
    ];
    if (refusalIndicators.some(function (i) { return lower.includes(i); }))
        return true;
    var shellPatterns = [
        /^\s*(?:cat|ls|cd|grep|find|echo|pwd|whoami|uname|head|tail|wc|mkdir|rm|cp|mv|chmod|curl|wget|pip|npm|git|python|node|docker)\s+\S/m,
        /^\s*\$\s+\w+/m,
        /```(?:bash|sh|shell|terminal|console|zsh)\n/i,
    ];
    if (shellPatterns.some(function (p) { return p.test(text); }))
        return true;
    var intentIndicators = [
        'vou verificar', 'vou checar', 'deixa eu ver', 'deixe-me verificar',
        'vou executar', 'vou rodar', 'vou ler o arquivo', 'vou listar',
        'vou acessar', 'vou consultar', 'vou buscar',
        'let me check', 'let me verify', 'let me run', 'let me read',
        'let me look', 'let me see', 'i\'ll check', 'i\'ll run',
        'i\'ll read', 'i\'ll look',
    ];
    if (intentIndicators.some(function (i) { return lower.includes(i); }))
        return true;
    return false;
}
