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
exports.execTool = void 0;
var node_child_process_1 = require("node:child_process");
var workspace_js_1 = require("../config/workspace.js");
var permissions_js_1 = require("../security/permissions.js");
exports.execTool = {
    name: 'exec',
    description: 'Execute a shell command and return stdout/stderr. Use for system commands, git, package managers, etc.',
    parameters: {
        type: 'object',
        properties: {
            command: {
                type: 'string',
                description: 'The shell command to execute',
            },
            cwd: {
                type: 'string',
                description: 'Working directory (defaults to current directory)',
            },
            timeout: {
                type: 'number',
                description: 'Timeout in milliseconds (default: 30000)',
            },
        },
        required: ['command'],
    },
    execute: function (args) {
        return __awaiter(this, void 0, void 0, function () {
            var command, cwd, timeout, output, e, output;
            return __generator(this, function (_a) {
                command = args.command;
                cwd = args.cwd || (0, workspace_js_1.getProjectDir)();
                timeout = args.timeout || 30000;
                try {
                    output = (0, node_child_process_1.execSync)(command, {
                        cwd: cwd,
                        timeout: timeout,
                        encoding: 'utf-8',
                        maxBuffer: 1024 * 1024,
                        stdio: ['pipe', 'pipe', 'pipe'],
                        env: (0, permissions_js_1.buildSafeEnv)(),
                    });
                    return [2 /*return*/, { success: true, output: stripAnsi(output.trim()) }];
                }
                catch (err) {
                    e = err;
                    output = [e.stdout, e.stderr].filter(Boolean).join('\n').trim();
                    return [2 /*return*/, {
                            success: false,
                            output: stripAnsi(output || e.message),
                            error: e.message,
                        }];
                }
                return [2 /*return*/];
            });
        });
    },
};
function stripAnsi(text) {
    return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1B\].*?\x07/g, '');
}
