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
exports.subagentTool = void 0;
exports.setSubagentSessionId = setSubagentSessionId;
var node_crypto_1 = require("node:crypto");
var subagent_js_1 = require("../agent/subagent.js");
var manager_js_1 = require("../session/manager.js");
var currentSessionId;
function setSubagentSessionId(id) {
    currentSessionId = id;
}
exports.subagentTool = {
    name: 'subagent',
    description: 'Spawn and manage subagents that run tasks in parallel. Each subagent is an independent agent with its own session and context. Actions: "spawn" creates one subagent, "spawn_many" creates multiple, "status" checks a task, "list" lists all tasks, "wait" waits for tasks to complete and returns results, "runs" lists orchestration run history, "cancel" cancels a specific task, "cancel_all" cancels all running/queued tasks.',
    parameters: {
        type: 'object',
        properties: {
            action: {
                type: 'string',
                enum: ['spawn', 'spawn_many', 'status', 'list', 'wait', 'runs', 'cancel', 'cancel_all'],
                description: 'Action to perform',
            },
            task: {
                type: 'string',
                description: 'Task description for the subagent (required for spawn)',
            },
            tasks: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of task descriptions (required for spawn_many)',
            },
            task_id: {
                type: 'string',
                description: 'Task ID to check (required for status)',
            },
            task_ids: {
                type: 'array',
                items: { type: 'string' },
                description: 'Task IDs to wait for (optional for wait — waits all if omitted)',
            },
            model: {
                type: 'string',
                description: 'Model override for the subagent (optional)',
            },
        },
        required: ['action'],
    },
    execute: function (args) {
        return __awaiter(this, void 0, void 0, function () {
            var action, manager, _a, task, model, runId, taskId, rawTasks, tasks, model, runId, taskIds, taskId, task, lines, tasks, lines, taskIds, results, lines, completed, failed, runs, lines, taskId, cancelled, count;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        action = args.action;
                        manager = (0, subagent_js_1.getSubagentManager)();
                        if (!currentSessionId) {
                            return [2 /*return*/, { success: false, output: '', error: 'No active session for subagent orchestration' }];
                        }
                        _a = action;
                        switch (_a) {
                            case 'spawn': return [3 /*break*/, 1];
                            case 'spawn_many': return [3 /*break*/, 3];
                            case 'status': return [3 /*break*/, 5];
                            case 'list': return [3 /*break*/, 6];
                            case 'wait': return [3 /*break*/, 7];
                            case 'runs': return [3 /*break*/, 12];
                            case 'cancel': return [3 /*break*/, 13];
                            case 'cancel_all': return [3 /*break*/, 14];
                        }
                        return [3 /*break*/, 15];
                    case 1:
                        if (!args.task) {
                            return [2 /*return*/, { success: false, output: '', error: '"task" is required for spawn action' }];
                        }
                        task = String(args.task);
                        model = args.model ? String(args.model) : undefined;
                        runId = (0, node_crypto_1.randomUUID)();
                        (0, manager_js_1.createOrchestrationRun)(runId, currentSessionId, task, 1);
                        return [4 /*yield*/, manager.spawn(currentSessionId, task, runId, model)];
                    case 2:
                        taskId = _c.sent();
                        return [2 /*return*/, { success: true, output: "Subagent spawned. Task ID: ".concat(taskId, "\nRun ID: ").concat(runId) }];
                    case 3:
                        rawTasks = args.tasks;
                        if (!rawTasks || !Array.isArray(rawTasks) || rawTasks.length === 0) {
                            return [2 /*return*/, { success: false, output: '', error: '"tasks" array is required for spawn_many action' }];
                        }
                        tasks = rawTasks.map(function (t) { return String(t); });
                        model = args.model ? String(args.model) : undefined;
                        runId = (0, node_crypto_1.randomUUID)();
                        (0, manager_js_1.createOrchestrationRun)(runId, currentSessionId, tasks.join('; ').slice(0, 200), tasks.length);
                        return [4 /*yield*/, manager.spawnMany(currentSessionId, tasks, runId, model)];
                    case 4:
                        taskIds = _c.sent();
                        return [2 /*return*/, {
                                success: true,
                                output: "".concat(taskIds.length, " subagents spawned.\nRun ID: ").concat(runId, "\nTask IDs:\n").concat(taskIds.map(function (id, i) { return "  ".concat(i + 1, ". ").concat(id); }).join('\n')),
                            }];
                    case 5:
                        {
                            taskId = args.task_id;
                            if (!taskId) {
                                return [2 /*return*/, { success: false, output: '', error: '"task_id" is required for status action' }];
                            }
                            task = manager.getTask(taskId);
                            if (!task) {
                                return [2 /*return*/, { success: false, output: '', error: "Task \"".concat(taskId, "\" not found") }];
                            }
                            lines = [
                                "Task: ".concat(task.id),
                                "Run: ".concat(task.runId),
                                "Status: ".concat(task.status),
                                "Model: ".concat((_b = task.model) !== null && _b !== void 0 ? _b : 'default'),
                                "Session: ".concat(task.sessionId),
                                "Created: ".concat(task.createdAt.toISOString()),
                            ];
                            if (task.startedAt)
                                lines.push("Started: ".concat(task.startedAt.toISOString()));
                            if (task.completedAt)
                                lines.push("Completed: ".concat(task.completedAt.toISOString()));
                            if (task.durationMs !== undefined)
                                lines.push("Duration: ".concat(task.durationMs, "ms"));
                            if (task.result)
                                lines.push("Result:\n".concat(task.result));
                            if (task.error)
                                lines.push("Error: ".concat(task.error));
                            return [2 /*return*/, { success: true, output: lines.join('\n') }];
                        }
                        _c.label = 6;
                    case 6:
                        {
                            tasks = manager.listTasks(currentSessionId);
                            if (tasks.length === 0) {
                                return [2 /*return*/, { success: true, output: 'No subagent tasks for this session.' }];
                            }
                            lines = tasks.map(function (t) {
                                var dur = t.durationMs !== undefined ? " ".concat((t.durationMs / 1000).toFixed(1), "s") : '';
                                var mod = t.model ? " [".concat(t.model, "]") : '';
                                return "[".concat(t.status).concat(dur, "] ").concat(t.id, " \u2014 ").concat(t.task.slice(0, 80)).concat(mod);
                            });
                            return [2 /*return*/, { success: true, output: "".concat(tasks.length, " tasks:\n").concat(lines.join('\n')) }];
                        }
                        _c.label = 7;
                    case 7:
                        taskIds = args.task_ids;
                        results = void 0;
                        if (!(taskIds && taskIds.length > 0)) return [3 /*break*/, 9];
                        return [4 /*yield*/, manager.waitTasks(taskIds)];
                    case 8:
                        results = _c.sent();
                        return [3 /*break*/, 11];
                    case 9: return [4 /*yield*/, manager.waitAll(currentSessionId)];
                    case 10:
                        results = _c.sent();
                        _c.label = 11;
                    case 11:
                        if (results.length === 0) {
                            return [2 /*return*/, { success: true, output: 'No tasks to wait for.' }];
                        }
                        lines = results.map(function (t) {
                            var _a, _b;
                            var header = "[".concat(t.status, "] Task ").concat(t.id);
                            if (t.status === 'completed') {
                                return "".concat(header, "\nResult:\n").concat((_a = t.result) !== null && _a !== void 0 ? _a : '(no output)');
                            }
                            else if (t.status === 'failed') {
                                return "".concat(header, "\nError: ").concat((_b = t.error) !== null && _b !== void 0 ? _b : 'unknown error');
                            }
                            return header;
                        });
                        completed = results.filter(function (t) { return t.status === 'completed'; }).length;
                        failed = results.filter(function (t) { return t.status === 'failed'; }).length;
                        return [2 /*return*/, {
                                success: true,
                                output: "All ".concat(results.length, " tasks finished (").concat(completed, " completed, ").concat(failed, " failed).\n\n").concat(lines.join('\n\n---\n\n')),
                            }];
                    case 12:
                        {
                            runs = (0, manager_js_1.listOrchestrationRuns)(currentSessionId);
                            if (runs.length === 0) {
                                return [2 /*return*/, { success: true, output: 'No orchestration runs for this session.' }];
                            }
                            lines = runs.map(function (r) {
                                var dur = r.duration_ms !== null ? "".concat((r.duration_ms / 1000).toFixed(1), "s") : 'in progress';
                                var preview = r.user_task.slice(0, 60).replace(/\n/g, ' ');
                                return "Run ".concat(r.id.slice(0, 8), " \u2014 \"").concat(preview, "\" (").concat(r.subtask_count, " subtasks, ").concat(r.status, ", ").concat(dur, ")");
                            });
                            return [2 /*return*/, { success: true, output: "".concat(runs.length, " orchestration runs:\n").concat(lines.join('\n')) }];
                        }
                        _c.label = 13;
                    case 13:
                        {
                            taskId = args.task_id;
                            if (!taskId) {
                                return [2 /*return*/, { success: false, output: '', error: '"task_id" is required for cancel action' }];
                            }
                            cancelled = manager.cancelTask(taskId);
                            if (cancelled) {
                                return [2 /*return*/, { success: true, output: "Task ".concat(taskId, " cancelled.") }];
                            }
                            return [2 /*return*/, { success: false, output: '', error: "Task \"".concat(taskId, "\" not found or already finished.") }];
                        }
                        _c.label = 14;
                    case 14:
                        {
                            count = manager.cancelAll(currentSessionId);
                            return [2 /*return*/, { success: true, output: "".concat(count, " task(s) cancelled.") }];
                        }
                        _c.label = 15;
                    case 15: return [2 /*return*/, { success: false, output: '', error: "Unknown action: ".concat(action, ". Use \"spawn\", \"spawn_many\", \"status\", \"list\", \"wait\", \"runs\", \"cancel\", or \"cancel_all\".") }];
                }
            });
        });
    },
};
