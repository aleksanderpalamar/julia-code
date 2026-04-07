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
exports.getModelInfo = getModelInfo;
exports.getContextLength = getContextLength;
exports.supportsTools = supportsTools;
exports.clearModelInfoCache = clearModelInfoCache;
var index_js_1 = require("../config/index.js");
var DEFAULT_CONTEXT_LENGTH = 4096;
var cache = new Map();
function getModelInfo(model) {
    return __awaiter(this, void 0, void 0, function () {
        var cached, info, ollamaHost, res, data, _a;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    cached = cache.get(model);
                    if (cached)
                        return [2 /*return*/, cached];
                    info = { name: model, contextLength: DEFAULT_CONTEXT_LENGTH, capabilities: [] };
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 5, , 6]);
                    ollamaHost = (0, index_js_1.getConfig)().ollamaHost;
                    return [4 /*yield*/, fetch("".concat(ollamaHost, "/api/show"), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: model }),
                        })];
                case 2:
                    res = _c.sent();
                    if (!res.ok) return [3 /*break*/, 4];
                    return [4 /*yield*/, res.json()];
                case 3:
                    data = _c.sent();
                    info.contextLength = (_b = extractContextLength(data)) !== null && _b !== void 0 ? _b : DEFAULT_CONTEXT_LENGTH;
                    info.capabilities = Array.isArray(data.capabilities) ? data.capabilities : [];
                    _c.label = 4;
                case 4: return [3 /*break*/, 6];
                case 5:
                    _a = _c.sent();
                    return [3 /*break*/, 6];
                case 6:
                    cache.set(model, info);
                    return [2 /*return*/, info];
            }
        });
    });
}
function getContextLength(model) {
    return __awaiter(this, void 0, void 0, function () {
        var info;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getModelInfo(model)];
                case 1:
                    info = _a.sent();
                    return [2 /*return*/, info.contextLength];
            }
        });
    });
}
function supportsTools(model) {
    return __awaiter(this, void 0, void 0, function () {
        var info;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getModelInfo(model)];
                case 1:
                    info = _a.sent();
                    return [2 /*return*/, info.capabilities.includes('tools')];
            }
        });
    });
}
function clearModelInfoCache() {
    cache.clear();
}
function extractContextLength(data) {
    var modelInfo = data.model_info;
    if (modelInfo) {
        for (var _i = 0, _a = Object.keys(modelInfo); _i < _a.length; _i++) {
            var key = _a[_i];
            if (key.endsWith('.context_length')) {
                var val = modelInfo[key];
                if (typeof val === 'number' && val > 0)
                    return val;
            }
        }
    }
    var modelfile = data.modelfile;
    if (modelfile) {
        var match = modelfile.match(/PARAMETER\s+num_ctx\s+(\d+)/i);
        if (match)
            return parseInt(match[1], 10);
    }
    return null;
}
