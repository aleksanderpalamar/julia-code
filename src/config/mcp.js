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
exports.getMcpServerConfigs = getMcpServerConfigs;
exports.addMcpServerConfig = addMcpServerConfig;
exports.removeMcpServerConfig = removeMcpServerConfig;
exports.setDefaultModel = setDefaultModel;
exports.setToolModel = setToolModel;
exports.clearToolModel = clearToolModel;
exports.getAvailableModels = getAvailableModels;
exports.getCurrentModel = getCurrentModel;
exports.syncAvailableModels = syncAvailableModels;
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var index_js_1 = require("./index.js");
var types_js_1 = require("./types.js");
function readSettings() {
    var path = (0, index_js_1.getSettingsPath)();
    if (!(0, node_fs_1.existsSync)(path))
        return {};
    try {
        return types_js_1.SettingsSchema.parse(JSON.parse((0, node_fs_1.readFileSync)(path, 'utf-8')));
    }
    catch (_a) {
        return {};
    }
}
function writeSettings(settings) {
    var path = (0, index_js_1.getSettingsPath)();
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(path), { recursive: true });
    (0, node_fs_1.writeFileSync)(path, JSON.stringify(settings, null, 2), 'utf-8');
}
function getMcpServerConfigs() {
    var _a;
    var settings = readSettings();
    return (_a = settings.mcpServers) !== null && _a !== void 0 ? _a : {};
}
function addMcpServerConfig(name, config) {
    var settings = readSettings();
    if (!settings.mcpServers) {
        settings.mcpServers = {};
    }
    settings.mcpServers[name] = config;
    writeSettings(settings);
}
function removeMcpServerConfig(name) {
    var settings = readSettings();
    if (settings.mcpServers) {
        delete settings.mcpServers[name];
    }
    writeSettings(settings);
}
function setDefaultModel(modelId) {
    var settings = readSettings();
    if (!settings.models) {
        settings.models = { provider: 'ollama', baseUrl: 'http://localhost:11434', default: modelId, toolModel: null, available: [] };
    }
    else {
        settings.models.default = modelId;
    }
    writeSettings(settings);
}
function setToolModel(modelId) {
    var settings = readSettings();
    if (!settings.models) {
        settings.models = { provider: 'ollama', baseUrl: 'http://localhost:11434', default: '', toolModel: modelId, available: [] };
    }
    else {
        settings.models.toolModel = modelId;
    }
    writeSettings(settings);
}
function clearToolModel() {
    var settings = readSettings();
    if (settings.models) {
        settings.models.toolModel = null;
    }
    writeSettings(settings);
}
function getAvailableModels() {
    var _a, _b;
    var settings = readSettings();
    return (_b = (_a = settings.models) === null || _a === void 0 ? void 0 : _a.available) !== null && _b !== void 0 ? _b : [];
}
function getCurrentModel() {
    var _a, _b;
    var settings = readSettings();
    return (_b = (_a = settings.models) === null || _a === void 0 ? void 0 : _a.default) !== null && _b !== void 0 ? _b : '';
}
function syncAvailableModels() {
    return __awaiter(this, void 0, void 0, function () {
        var listOllamaModelsDetailed, _a, classifyModels, selectToolModel, detailedModels, classified, settings, selectFastModel, hasLocal, hasCloud, currentDefault, currentDefaultIsCloud, fast, autoTool, fast;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('../providers/ollama.js'); })];
                case 1:
                    listOllamaModelsDetailed = (_d.sent()).listOllamaModelsDetailed;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('../providers/model-classifier.js'); })];
                case 2:
                    _a = _d.sent(), classifyModels = _a.classifyModels, selectToolModel = _a.selectToolModel;
                    return [4 /*yield*/, listOllamaModelsDetailed()];
                case 3:
                    detailedModels = _d.sent();
                    classified = classifyModels(detailedModels);
                    settings = readSettings();
                    if (!settings.models) {
                        settings.models = { provider: 'ollama', baseUrl: 'http://localhost:11434', default: '', toolModel: null, available: [] };
                    }
                    settings.models.available = classified.map(function (m) { return ({
                        id: m.id,
                        name: m.id,
                        isCloud: m.isCloud,
                    }); });
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('../providers/model-classifier.js'); })];
                case 4:
                    selectFastModel = (_d.sent()).selectFastModel;
                    hasLocal = classified.some(function (m) { return m.isLocal; });
                    hasCloud = classified.some(function (m) { return m.isCloud; });
                    currentDefault = settings.models.default;
                    currentDefaultIsCloud = (_c = (_b = classified.find(function (m) { return m.id === currentDefault; })) === null || _b === void 0 ? void 0 : _b.isCloud) !== null && _c !== void 0 ? _c : false;
                    if (!settings.models.toolModel && hasLocal && hasCloud) {
                        if (currentDefaultIsCloud) {
                            settings.models.toolModel = currentDefault;
                            fast = selectFastModel(classified);
                            if (fast) {
                                settings.models.default = fast;
                            }
                        }
                        else {
                            autoTool = selectToolModel(classified, currentDefault);
                            if (autoTool) {
                                settings.models.toolModel = autoTool;
                            }
                        }
                    }
                    if (!settings.models.default && classified.length > 0) {
                        fast = selectFastModel(classified);
                        if (fast) {
                            settings.models.default = fast;
                        }
                        else {
                            settings.models.default = classified[0].id;
                        }
                    }
                    writeSettings(settings);
                    return [2 /*return*/];
            }
        });
    });
}
