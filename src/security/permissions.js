"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SAFE_ENV_VARS = exports.TOOL_RISK = void 0;
exports.getToolRisk = getToolRisk;
exports.isBlockedCommand = isBlockedCommand;
exports.buildSafeEnv = buildSafeEnv;
exports.matchesAllowRule = matchesAllowRule;
var minimatch_1 = require("minimatch");
exports.TOOL_RISK = {
    read: 'safe',
    glob: 'safe',
    grep: 'safe',
    sessions: 'safe',
    memory: 'moderate',
    fetch: 'moderate',
    write: 'dangerous',
    edit: 'dangerous',
    exec: 'dangerous',
    subagent: 'dangerous',
};
function getToolRisk(toolName) {
    var _a;
    if (toolName.startsWith('mcp__'))
        return 'dangerous';
    return (_a = exports.TOOL_RISK[toolName]) !== null && _a !== void 0 ? _a : 'dangerous';
}
var BLOCKED_COMMANDS = [
    /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?(-[a-zA-Z]*r[a-zA-Z]*\s+)?\/\s*$/, // rm -rf /
    /\brm\s+-[a-zA-Z]*r[a-zA-Z]*\s+-[a-zA-Z]*f[a-zA-Z]*\s+\/\s*$/, // rm -rf /
    /:(){ :\|:& };:/, // fork bomb
    /\bcurl\b.*\|\s*(sudo\s+)?(ba)?sh\b/, // curl | sh
    /\bwget\b.*\|\s*(sudo\s+)?(ba)?sh\b/, // wget | sh
    /\beval\s*\(\s*["'`]/, // eval("...
    /\bmkfs\./, // mkfs.*
    /\bdd\s+.*of=\/dev\//, // dd of=/dev/*
    /\bchmod\s+(-[a-zA-Z]*\s+)?[0-7]*777\s+\//, // chmod 777 /
    />\s*\/dev\/sd[a-z]/, // write to disk device
    /\bnpm\s+publish\b/, // npm publish (without explicit intent)
];
function isBlockedCommand(command) {
    return BLOCKED_COMMANDS.some(function (pattern) { return pattern.test(command); });
}
exports.SAFE_ENV_VARS = [
    'PATH', 'HOME', 'USER', 'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE',
    'TERM', 'NO_COLOR', 'EDITOR', 'VISUAL', 'TZ', 'TMPDIR',
    'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_RUNTIME_DIR',
    'NODE_ENV', 'NPM_CONFIG_PREFIX',
];
function buildSafeEnv(extra) {
    var env = {};
    for (var _i = 0, SAFE_ENV_VARS_1 = exports.SAFE_ENV_VARS; _i < SAFE_ENV_VARS_1.length; _i++) {
        var key = SAFE_ENV_VARS_1[_i];
        if (process.env[key]) {
            env[key] = process.env[key];
        }
    }
    if (extra) {
        Object.assign(env, extra);
    }
    env.TERM = 'dumb';
    env.NO_COLOR = '1';
    return env;
}
function matchesAllowRule(toolName, args, rules) {
    for (var _i = 0, rules_1 = rules; _i < rules_1.length; _i++) {
        var rule = rules_1[_i];
        if (rule.tool !== toolName)
            continue;
        if (toolName === 'exec') {
            var command = args.command;
            if (command && (0, minimatch_1.minimatch)(command, rule.pattern))
                return true;
        }
        if (toolName === 'write' || toolName === 'edit') {
            var path = args.path;
            if (path && (0, minimatch_1.minimatch)(path, rule.pattern))
                return true;
        }
        if (toolName === 'fetch') {
            var url = args.url;
            if (url && (0, minimatch_1.minimatch)(url, rule.pattern))
                return true;
        }
    }
    return false;
}
