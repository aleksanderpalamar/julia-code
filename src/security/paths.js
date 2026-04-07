"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDeniedPath = isDeniedPath;
exports.isSystemPath = isSystemPath;
exports.validateReadPath = validateReadPath;
exports.validateWritePath = validateWritePath;
var node_path_1 = require("node:path");
var node_os_1 = require("node:os");
var workspace_js_1 = require("../config/workspace.js");
var DENIED_PATH_PATTERNS = [
    /\/\.ssh\//,
    /\/\.ssh$/,
    /\/\.gnupg\//,
    /\/\.gnupg$/,
    /\/\.aws\//,
    /\/\.aws$/,
    /\/\.docker\//,
    /\/\.docker$/,
    /\/\.kube\//,
    /\/\.kube$/,
    /\/\.npmrc$/,
    /\/\.env$/,
    /\/\.env\./,
    /\/credentials/i,
    /\/\.netrc$/,
    /\/\.pgpass$/,
    /\/\.my\.cnf$/,
    /\/\.git-credentials$/,
    /\/\.config\/gh\//,
];
var SYSTEM_WRITE_DENIED = [
    /^\/etc\//,
    /^\/usr\//,
    /^\/bin\//,
    /^\/sbin\//,
    /^\/boot\//,
    /^\/sys\//,
    /^\/proc\//,
    /^\/dev\//,
    /^\/var\/log\//,
];
function isDeniedPath(resolvedPath) {
    for (var _i = 0, DENIED_PATH_PATTERNS_1 = DENIED_PATH_PATTERNS; _i < DENIED_PATH_PATTERNS_1.length; _i++) {
        var pattern = DENIED_PATH_PATTERNS_1[_i];
        if (pattern.test(resolvedPath)) {
            return true;
        }
    }
    return false;
}
function isSystemPath(resolvedPath) {
    for (var _i = 0, SYSTEM_WRITE_DENIED_1 = SYSTEM_WRITE_DENIED; _i < SYSTEM_WRITE_DENIED_1.length; _i++) {
        var pattern = SYSTEM_WRITE_DENIED_1[_i];
        if (pattern.test(resolvedPath)) {
            return true;
        }
    }
    return false;
}
function validateReadPath(inputPath) {
    var resolved = resolveAndContain(inputPath);
    if (isDeniedPath(resolved)) {
        throw new Error("Acesso negado: \"".concat(inputPath, "\" \u00E9 um caminho sens\u00EDvel protegido"));
    }
    return resolved;
}
function validateWritePath(inputPath) {
    var resolved = validateReadPath(inputPath);
    if (isSystemPath(resolved)) {
        throw new Error("Acesso negado: n\u00E3o \u00E9 permitido escrever em \"".concat(inputPath, "\" (caminho de sistema)"));
    }
    return resolved;
}
function resolveAndContain(inputPath) {
    var projectDir = (0, workspace_js_1.getProjectDir)();
    var juliaHome = node_path_1.default.join(node_os_1.default.homedir(), '.juliacode');
    var workspace = (0, workspace_js_1.getWorkspace)();
    var resolved = node_path_1.default.resolve(projectDir, inputPath);
    if (isWithin(resolved, projectDir) ||
        isWithin(resolved, juliaHome) ||
        isWithin(resolved, workspace)) {
        return resolved;
    }
    throw new Error("Acesso negado: \"".concat(inputPath, "\" est\u00E1 fora do diret\u00F3rio do projeto"));
}
function isWithin(filePath, dir) {
    return filePath === dir || filePath.startsWith(dir + node_path_1.default.sep);
}
