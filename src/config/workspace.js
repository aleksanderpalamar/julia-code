"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initWorkspace = initWorkspace;
exports.getWorkspace = getWorkspace;
exports.getProjectDir = getProjectDir;
exports.resolveInProject = resolveInProject;
exports.resolveInWorkspace = resolveInWorkspace;
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var node_os_1 = require("node:os");
var index_js_1 = require("./index.js");
var _workspace = null;
var _projectDir = process.cwd();
function initWorkspace() {
    var config = (0, index_js_1.getConfig)();
    _workspace = config.workspace
        ? (0, node_path_1.resolve)(config.workspace)
        : _projectDir;
    (0, node_fs_1.mkdirSync)(_workspace, { recursive: true });
    return _workspace;
}
function getWorkspace() {
    if (!_workspace)
        return initWorkspace();
    return _workspace;
}
function getProjectDir() {
    return _projectDir;
}
function resolveInProject(inputPath) {
    var resolved = (0, node_path_1.resolve)(_projectDir, inputPath);
    var juliaHome = (0, node_path_1.join)((0, node_os_1.homedir)(), '.juliacode');
    if (resolved === _projectDir ||
        resolved.startsWith(_projectDir + node_path_1.sep) ||
        resolved.startsWith(juliaHome + node_path_1.sep)) {
        return resolved;
    }
    throw new Error("Acesso negado: \"".concat(inputPath, "\" est\u00E1 fora do diret\u00F3rio do projeto"));
}
function resolveInWorkspace(inputPath) {
    var workspace = getWorkspace();
    var resolved = (0, node_path_1.resolve)(workspace, inputPath);
    var juliaHome = (0, node_path_1.join)((0, node_os_1.homedir)(), '.juliacode');
    if (resolved === workspace ||
        resolved.startsWith(workspace + node_path_1.sep) ||
        resolved.startsWith(juliaHome + node_path_1.sep)) {
        return resolved;
    }
    throw new Error("Acesso negado: \"".concat(inputPath, "\" est\u00E1 fora do workspace"));
}
