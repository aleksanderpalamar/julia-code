"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSkills = loadSkills;
exports.loadUserSkills = loadUserSkills;
exports.loadTemperamentSkill = loadTemperamentSkill;
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var sanitize_js_1 = require("../security/sanitize.js");
var DEFAULTS_DIR = new URL('defaults/', import.meta.url).pathname;
var USER_SKILLS_DIR = (0, node_path_1.join)(process.cwd(), 'data', 'skills');
var MAX_SKILL_SIZE = 50 * 1024;
function loadSkills() {
    return loadFromDir(DEFAULTS_DIR);
}
function loadUserSkills() {
    if (!(0, node_fs_1.existsSync)(USER_SKILLS_DIR))
        return [];
    var skills = [];
    if (!(0, node_fs_1.existsSync)(USER_SKILLS_DIR))
        return skills;
    for (var _i = 0, _a = (0, node_fs_1.readdirSync)(USER_SKILLS_DIR); _i < _a.length; _i++) {
        var file = _a[_i];
        if (!file.endsWith('.md'))
            continue;
        var filePath = (0, node_path_1.join)(USER_SKILLS_DIR, file);
        var stat = (0, node_fs_1.statSync)(filePath);
        if (stat.size > MAX_SKILL_SIZE) {
            process.stderr.write("[security] Skill \"".concat(file, "\" excede ").concat(MAX_SKILL_SIZE, " bytes \u2014 ignorado\n"));
            continue;
        }
        var content = (0, node_fs_1.readFileSync)(filePath, 'utf-8');
        var scan = (0, sanitize_js_1.scanForInjection)(content);
        if (scan.isSuspicious) {
            process.stderr.write("[security] Skill \"".concat(file, "\" cont\u00E9m padr\u00F5es suspeitos (").concat(scan.detections.join(', '), ") \u2014 ignorado\n"));
            continue;
        }
        skills.push({ name: (0, node_path_1.basename)(file, '.md'), content: content });
    }
    return skills;
}
function loadTemperamentSkill(temperament) {
    var TEMPERAMENTS_DIR = new URL('temperaments/', import.meta.url).pathname;
    var filePath = (0, node_path_1.join)(TEMPERAMENTS_DIR, "".concat(temperament, ".md"));
    if (!(0, node_fs_1.existsSync)(filePath))
        return null;
    var content = (0, node_fs_1.readFileSync)(filePath, 'utf-8');
    if (!content.trim())
        return null;
    return { name: "temperament-".concat(temperament), content: content };
}
function loadFromDir(dir) {
    var skills = [];
    if (!(0, node_fs_1.existsSync)(dir))
        return skills;
    for (var _i = 0, _a = (0, node_fs_1.readdirSync)(dir); _i < _a.length; _i++) {
        var file = _a[_i];
        if (!file.endsWith('.md'))
            continue;
        var content = (0, node_fs_1.readFileSync)((0, node_path_1.join)(dir, file), 'utf-8');
        skills.push({ name: (0, node_path_1.basename)(file, '.md'), content: content });
    }
    return skills;
}
