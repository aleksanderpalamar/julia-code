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
exports.globTool = void 0;
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var minimatch_1 = require("minimatch");
var workspace_js_1 = require("../config/workspace.js");
exports.globTool = {
    name: 'glob',
    description: 'Find files matching a glob pattern. Returns a list of file paths.',
    parameters: {
        type: 'object',
        properties: {
            pattern: {
                type: 'string',
                description: 'Glob pattern (e.g., "**/*.ts", "src/**/*.tsx")',
            },
            cwd: {
                type: 'string',
                description: 'Directory to search in (defaults to current directory)',
            },
        },
        required: ['pattern'],
    },
    execute: function (args) {
        return __awaiter(this, void 0, void 0, function () {
            var pattern, cwd, matches, limited, output, err_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pattern = args.pattern;
                        cwd = (0, node_path_1.resolve)(args.cwd || (0, workspace_js_1.getProjectDir)());
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, findMatches(cwd, pattern)];
                    case 2:
                        matches = _a.sent();
                        if (matches.length === 0) {
                            return [2 /*return*/, { success: true, output: 'No files found matching pattern.' }];
                        }
                        matches.sort();
                        limited = matches.slice(0, 200);
                        output = limited.join('\n')
                            + (matches.length > 200 ? "\n... (".concat(matches.length - 200, " more files)") : '');
                        return [2 /*return*/, { success: true, output: output }];
                    case 3:
                        err_1 = _a.sent();
                        return [2 /*return*/, {
                                success: false,
                                output: '',
                                error: err_1 instanceof Error ? err_1.message : String(err_1),
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    },
};
function findMatches(root_1, pattern_1) {
    return __awaiter(this, arguments, void 0, function (root, pattern, maxDepth) {
        function walk(dir, depth) {
            return __awaiter(this, void 0, void 0, function () {
                var entries, _a, _i, entries_1, entry, fullPath, relPath;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            if (depth > maxDepth || results.length >= MAX_RESULTS)
                                return [2 /*return*/];
                            _b.label = 1;
                        case 1:
                            _b.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, (0, promises_1.readdir)(dir, { withFileTypes: true })];
                        case 2:
                            entries = _b.sent();
                            return [3 /*break*/, 4];
                        case 3:
                            _a = _b.sent();
                            return [2 /*return*/];
                        case 4:
                            _i = 0, entries_1 = entries;
                            _b.label = 5;
                        case 5:
                            if (!(_i < entries_1.length)) return [3 /*break*/, 9];
                            entry = entries_1[_i];
                            if (results.length >= MAX_RESULTS)
                                return [3 /*break*/, 9];
                            fullPath = (0, node_path_1.resolve)(dir, entry.name);
                            relPath = (0, node_path_1.relative)(root, fullPath);
                            if (entry.isDirectory() && entry.name.startsWith('.'))
                                return [3 /*break*/, 8];
                            if (!entry.isDirectory()) return [3 /*break*/, 7];
                            return [4 /*yield*/, walk(fullPath, depth + 1)];
                        case 6:
                            _b.sent();
                            _b.label = 7;
                        case 7:
                            if ((0, minimatch_1.minimatch)(relPath, pattern, { dot: false, matchBase: !pattern.includes('/') })) {
                                results.push(relPath);
                            }
                            _b.label = 8;
                        case 8:
                            _i++;
                            return [3 /*break*/, 5];
                        case 9: return [2 /*return*/];
                    }
                });
            });
        }
        var results, MAX_RESULTS;
        if (maxDepth === void 0) { maxDepth = 20; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    results = [];
                    MAX_RESULTS = 500;
                    return [4 /*yield*/, walk(root, 0)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, results];
            }
        });
    });
}
