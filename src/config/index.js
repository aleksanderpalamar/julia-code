"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSettingsPath = getSettingsPath;
exports.getSettings = getSettings;
exports.loadConfig = loadConfig;
exports.getConfig = getConfig;
exports.reloadConfig = reloadConfig;
var dotenv_1 = require("dotenv");
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var node_os_1 = require("node:os");
var types_js_1 = require("./types.js");
var _config = null;
var _settings = null;
var JULIA_HOME = (0, node_path_1.join)((0, node_os_1.homedir)(), '.juliacode');
var SETTINGS_PATH = (0, node_path_1.join)(JULIA_HOME, 'settings.json');
function ensureJuliaHome() {
    (0, node_fs_1.mkdirSync)((0, node_path_1.join)(JULIA_HOME, 'data'), { recursive: true });
    if (!(0, node_fs_1.existsSync)(SETTINGS_PATH)) {
        var defaults = {
            meta: { version: '0.1.0' },
            models: {
                provider: 'ollama',
                baseUrl: 'http://localhost:11434',
                default: '',
                available: [],
            },
            agent: { maxToolIterations: 25 },
            session: { compactionThreshold: 6000, compactionKeepRecent: 6 },
        };
        (0, node_fs_1.writeFileSync)(SETTINGS_PATH, JSON.stringify(defaults, null, 2));
    }
}
function loadSettings() {
    if (_settings)
        return _settings;
    if (!(0, node_fs_1.existsSync)(SETTINGS_PATH))
        return null;
    try {
        var raw = (0, node_fs_1.readFileSync)(SETTINGS_PATH, 'utf-8');
        _settings = types_js_1.SettingsSchema.parse(JSON.parse(raw));
        return _settings;
    }
    catch (_a) {
        return null;
    }
}
function getSettingsPath() {
    return SETTINGS_PATH;
}
function getSettings() {
    return _settings !== null && _settings !== void 0 ? _settings : loadSettings();
}
function loadConfig() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w;
    if (_config)
        return _config;
    ensureJuliaHome();
    (0, dotenv_1.config)();
    var settings = loadSettings();
    _config = types_js_1.ConfigSchema.parse({
        ollamaHost: (_a = process.env.OLLAMA_HOST) !== null && _a !== void 0 ? _a : (_b = settings === null || settings === void 0 ? void 0 : settings.models) === null || _b === void 0 ? void 0 : _b.baseUrl,
        defaultModel: (_c = process.env.DEFAULT_MODEL) !== null && _c !== void 0 ? _c : (_d = settings === null || settings === void 0 ? void 0 : settings.models) === null || _d === void 0 ? void 0 : _d.default,
        maxToolIterations: process.env.MAX_TOOL_ITERATIONS
            ? Number(process.env.MAX_TOOL_ITERATIONS)
            : (_e = settings === null || settings === void 0 ? void 0 : settings.agent) === null || _e === void 0 ? void 0 : _e.maxToolIterations,
        dbPath: (_f = process.env.DB_PATH) !== null && _f !== void 0 ? _f : (_g = settings === null || settings === void 0 ? void 0 : settings.storage) === null || _g === void 0 ? void 0 : _g.dbPath,
        compactionThreshold: process.env.COMPACTION_THRESHOLD
            ? Number(process.env.COMPACTION_THRESHOLD)
            : (_h = settings === null || settings === void 0 ? void 0 : settings.session) === null || _h === void 0 ? void 0 : _h.compactionThreshold,
        compactionKeepRecent: process.env.COMPACTION_KEEP_RECENT
            ? Number(process.env.COMPACTION_KEEP_RECENT)
            : (_j = settings === null || settings === void 0 ? void 0 : settings.session) === null || _j === void 0 ? void 0 : _j.compactionKeepRecent,
        workspace: (_k = process.env.WORKSPACE) !== null && _k !== void 0 ? _k : settings === null || settings === void 0 ? void 0 : settings.workspace,
        acpEnabled: (_l = settings === null || settings === void 0 ? void 0 : settings.acp) === null || _l === void 0 ? void 0 : _l.enabled,
        acpAutoOrchestrate: (_m = settings === null || settings === void 0 ? void 0 : settings.acp) === null || _m === void 0 ? void 0 : _m.autoOrchestrate,
        acpMaxConcurrent: (_o = settings === null || settings === void 0 ? void 0 : settings.acp) === null || _o === void 0 ? void 0 : _o.maxConcurrent,
        acpSubagentMaxIterations: (_p = settings === null || settings === void 0 ? void 0 : settings.acp) === null || _p === void 0 ? void 0 : _p.subagentMaxIterations,
        acpDefaultModel: (_q = settings === null || settings === void 0 ? void 0 : settings.acp) === null || _q === void 0 ? void 0 : _q.defaultModel,
        acpCancelOnFailure: (_r = settings === null || settings === void 0 ? void 0 : settings.acp) === null || _r === void 0 ? void 0 : _r.cancelOnFailure,
        toolModel: (_s = settings === null || settings === void 0 ? void 0 : settings.models) === null || _s === void 0 ? void 0 : _s.toolModel,
        defaultTemperament: (_t = settings === null || settings === void 0 ? void 0 : settings.temperament) === null || _t === void 0 ? void 0 : _t.default,
        contextReservePercent: (_u = settings === null || settings === void 0 ? void 0 : settings.context) === null || _u === void 0 ? void 0 : _u.reservePercent,
        contextEmergencyThreshold: (_v = settings === null || settings === void 0 ? void 0 : settings.context) === null || _v === void 0 ? void 0 : _v.emergencyThreshold,
        contextMaxToolResultTokens: (_w = settings === null || settings === void 0 ? void 0 : settings.context) === null || _w === void 0 ? void 0 : _w.maxToolResultTokens,
    });
    if (_config.dbPath && !_config.dbPath.startsWith('/')) {
        _config.dbPath = (0, node_path_1.join)(JULIA_HOME, _config.dbPath);
    }
    return _config;
}
function getConfig() {
    if (!_config)
        return loadConfig();
    return _config;
}
function reloadConfig() {
    _config = null;
    _settings = null;
    return loadConfig();
}
