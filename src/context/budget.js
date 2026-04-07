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
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeBudget = computeBudget;
exports.computeToolResultCap = computeToolResultCap;
var model_info_js_1 = require("./model-info.js");
var token_counter_js_1 = require("./token-counter.js");
function computeBudget(model, systemPromptText) {
    return __awaiter(this, void 0, void 0, function () {
        var total, reservedForOutput, available, systemPrompt, taskAnchor, _a, memoriesPct, compactedHistoryPct, memories, compactedHistory, recentMessages;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, model_info_js_1.getContextLength)(model)];
                case 1:
                    total = _b.sent();
                    reservedForOutput = Math.max(Math.min(Math.floor(total * 0.15), 4096), 512);
                    available = total - reservedForOutput;
                    systemPrompt = systemPromptText
                        ? (0, token_counter_js_1.estimateTokens)(systemPromptText)
                        : Math.min(2500, Math.floor(available * 0.25));
                    taskAnchor = Math.min(500, Math.floor(available * 0.05));
                    _a = getModelSizeRatios(total), memoriesPct = _a.memoriesPct, compactedHistoryPct = _a.compactedHistoryPct;
                    memories = Math.min(Math.floor(available * memoriesPct), 1000);
                    compactedHistory = Math.floor(available * compactedHistoryPct);
                    recentMessages = Math.max(available - systemPrompt - taskAnchor - memories - compactedHistory, Math.floor(available * 0.2));
                    return [2 /*return*/, {
                            total: total,
                            reservedForOutput: reservedForOutput,
                            available: available,
                            systemPrompt: systemPrompt,
                            taskAnchor: taskAnchor,
                            memories: memories,
                            compactedHistory: compactedHistory,
                            recentMessages: recentMessages,
                        }];
            }
        });
    });
}
function computeToolResultCap(budget, toolName) {
    var baseTokens = budget.recentMessages;
    var pct;
    switch (toolName) {
        case 'read':
        case 'edit':
        case 'write':
            pct = 0.40;
            break;
        case 'exec':
            pct = 0.20;
            break;
        case 'grep':
        case 'glob':
            pct = 0.25;
            break;
        default:
            pct = 0.25;
    }
    var capChars = Math.floor(baseTokens * pct * 3.5);
    return Math.min(capChars, 12000);
}
function getModelSizeRatios(contextLength) {
    if (contextLength <= 8192) {
        return { memoriesPct: 0.03, compactedHistoryPct: 0.15 };
    }
    if (contextLength <= 32768) {
        return { memoriesPct: 0.05, compactedHistoryPct: 0.25 };
    }
    return { memoriesPct: 0.05, compactedHistoryPct: 0.30 };
}
