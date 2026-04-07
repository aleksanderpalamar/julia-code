"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
exports.getSubagentManager = getSubagentManager;
var node_crypto_1 = require("node:crypto");
var node_events_1 = require("node:events");
var loop_js_1 = require("./loop.js");
var manager_js_1 = require("../session/manager.js");
var index_js_1 = require("../config/index.js");
var SubagentManager = /** @class */ (function (_super) {
    __extends(SubagentManager, _super);
    function SubagentManager() {
        var _this = _super.call(this) || this;
        _this.tasks = new Map();
        _this.agents = new Map();
        _this.running = 0;
        _this.queue = [];
        _this.sessionPool = [];
        return _this;
    }
    SubagentManager.prototype.prewarm = function (count) {
        for (var i = 0; i < count; i++) {
            var session = (0, manager_js_1.createSession)('subagent: (prewarmed)');
            this.sessionPool.push(session.id);
        }
    };
    SubagentManager.prototype.getOrCreateSession = function (label) {
        if (this.sessionPool.length > 0) {
            return this.sessionPool.pop();
        }
        return (0, manager_js_1.createSession)(label).id;
    };
    SubagentManager.prototype.spawn = function (parentSessionId, taskDescription, runId, model) {
        return __awaiter(this, void 0, void 0, function () {
            var config, taskId, desc, preview, sessionId, resolvedModel, task, maxConcurrent;
            var _a;
            return __generator(this, function (_b) {
                config = (0, index_js_1.getConfig)();
                taskId = (0, node_crypto_1.randomUUID)();
                desc = String(taskDescription !== null && taskDescription !== void 0 ? taskDescription : '');
                preview = desc.slice(0, 60).replace(/\n/g, ' ');
                sessionId = this.getOrCreateSession("subagent: ".concat(preview));
                resolvedModel = (_a = model !== null && model !== void 0 ? model : config.acpDefaultModel) !== null && _a !== void 0 ? _a : config.defaultModel;
                task = {
                    id: taskId,
                    runId: runId,
                    parentSessionId: parentSessionId,
                    sessionId: sessionId,
                    task: desc,
                    model: resolvedModel,
                    status: 'queued',
                    createdAt: new Date(),
                };
                this.tasks.set(taskId, task);
                (0, manager_js_1.createSubagentRun)(taskId, runId, sessionId, desc, resolvedModel);
                this.emit('task:queued', taskId, preview);
                maxConcurrent = config.acpMaxConcurrent;
                if (this.running < maxConcurrent) {
                    this.runTask(task, resolvedModel);
                }
                else {
                    this.queue.push({ task: task, model: resolvedModel });
                }
                return [2 /*return*/, taskId];
            });
        });
    };
    SubagentManager.prototype.spawnMany = function (parentSessionId, tasks, runId, model) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, Promise.all(tasks.map(function (t) {
                        var _a;
                        if (typeof t === 'string') {
                            return _this.spawn(parentSessionId, t, runId, model);
                        }
                        return _this.spawn(parentSessionId, t.task, runId, (_a = t.model) !== null && _a !== void 0 ? _a : model);
                    }))];
            });
        });
    };
    SubagentManager.prototype.getTask = function (taskId) {
        return this.tasks.get(taskId);
    };
    SubagentManager.prototype.listTasks = function (parentSessionId) {
        return Array.from(this.tasks.values())
            .filter(function (t) { return t.parentSessionId === parentSessionId; });
    };
    SubagentManager.prototype.waitAll = function (parentSessionId) {
        return __awaiter(this, void 0, void 0, function () {
            var tasks, pendingIds;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        tasks = this.listTasks(parentSessionId);
                        pendingIds = tasks
                            .filter(function (t) { return t.status === 'queued' || t.status === 'running'; })
                            .map(function (t) { return t.id; });
                        if (pendingIds.length === 0)
                            return [2 /*return*/, tasks];
                        return [4 /*yield*/, this.waitTasks(pendingIds)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, this.listTasks(parentSessionId)];
                }
            });
        });
    };
    SubagentManager.prototype.waitTasks = function (taskIds) {
        return __awaiter(this, void 0, void 0, function () {
            var pending;
            var _this = this;
            return __generator(this, function (_a) {
                pending = new Set(taskIds.filter(function (id) {
                    var t = _this.tasks.get(id);
                    return !t || t.status === 'queued' || t.status === 'running';
                }));
                if (pending.size === 0) {
                    return [2 /*return*/, taskIds.map(function (id) { return _this.tasks.get(id); })];
                }
                return [2 /*return*/, new Promise(function (resolve) {
                        var onDone = function (taskId) {
                            pending.delete(taskId);
                            if (pending.size === 0) {
                                _this.off('task:completed', onDone);
                                _this.off('task:failed', onDone);
                                resolve(taskIds.map(function (id) { return _this.tasks.get(id); }));
                            }
                        };
                        _this.on('task:completed', onDone);
                        _this.on('task:failed', onDone);
                    })];
            });
        });
    };
    SubagentManager.prototype.runTask = function (task, model) {
        var _this = this;
        var label = task.task.slice(0, 60).replace(/\n/g, ' ');
        task.status = 'running';
        task.startedAt = new Date();
        this.running++;
        (0, manager_js_1.updateSubagentRunStatus)(task.id, 'running', { startedAt: task.startedAt.toISOString() });
        this.emit('task:started', task.id, label);
        var config = (0, index_js_1.getConfig)();
        var agent = new loop_js_1.AgentLoop({
            maxIterations: config.acpSubagentMaxIterations,
            excludeTools: ['subagent'], // Prevent recursive subagent spawning
        });
        this.agents.set(task.id, agent);
        var resultText = '';
        agent.on('chunk', function (text) {
            resultText += text;
            _this.emit('task:chunk', task.id, text);
        });
        agent.on('done', function (fullText) {
            if (task.status === 'completed' || task.status === 'failed')
                return;
            var result = fullText || resultText;
            task.status = 'completed';
            task.result = result;
            task.completedAt = new Date();
            task.durationMs = task.startedAt ? task.completedAt.getTime() - task.startedAt.getTime() : undefined;
            (0, manager_js_1.updateSubagentRunStatus)(task.id, 'completed', {
                completedAt: task.completedAt.toISOString(),
                durationMs: task.durationMs,
                result: task.result,
            });
            _this.agents.delete(task.id);
            _this.running--;
            _this.emit('task:completed', task.id, result);
            _this.drainQueue();
        });
        agent.on('error', function (error) {
            if (task.status === 'completed' || task.status === 'failed')
                return;
            task.status = 'failed';
            task.error = error;
            task.completedAt = new Date();
            task.durationMs = task.startedAt ? task.completedAt.getTime() - task.startedAt.getTime() : undefined;
            (0, manager_js_1.updateSubagentRunStatus)(task.id, 'failed', {
                completedAt: task.completedAt.toISOString(),
                durationMs: task.durationMs,
                error: task.error,
            });
            _this.agents.delete(task.id);
            _this.running--;
            _this.emit('task:failed', task.id, error);
            _this.drainQueue();
        });
        agent.run(task.sessionId, task.task, model).catch(function (err) {
            if (task.status === 'completed' || task.status === 'failed')
                return;
            var errorMsg = err instanceof Error ? err.message : String(err);
            task.status = 'failed';
            task.error = errorMsg;
            task.completedAt = new Date();
            task.durationMs = task.startedAt ? task.completedAt.getTime() - task.startedAt.getTime() : undefined;
            (0, manager_js_1.updateSubagentRunStatus)(task.id, 'failed', {
                completedAt: task.completedAt.toISOString(),
                durationMs: task.durationMs,
                error: task.error,
            });
            _this.agents.delete(task.id);
            _this.running--;
            _this.emit('task:failed', task.id, errorMsg);
            _this.drainQueue();
        });
    };
    SubagentManager.prototype.cancelTask = function (taskId) {
        var task = this.tasks.get(taskId);
        if (!task || task.status === 'completed' || task.status === 'failed')
            return false;
        var agent = this.agents.get(taskId);
        if (agent) {
            agent.abort();
            this.agents.delete(taskId);
            this.running--;
        }
        var queueIdx = this.queue.findIndex(function (item) { return item.task.id === taskId; });
        if (queueIdx >= 0) {
            this.queue.splice(queueIdx, 1);
        }
        task.status = 'failed';
        task.error = 'Cancelled';
        task.completedAt = new Date();
        task.durationMs = task.startedAt ? task.completedAt.getTime() - task.startedAt.getTime() : undefined;
        (0, manager_js_1.updateSubagentRunStatus)(task.id, 'failed', {
            completedAt: task.completedAt.toISOString(),
            durationMs: task.durationMs,
            error: 'Cancelled',
        });
        this.emit('task:failed', task.id, 'Cancelled');
        this.drainQueue();
        return true;
    };
    SubagentManager.prototype.cancelAll = function (parentSessionId) {
        var cancelled = 0;
        for (var _i = 0, _a = this.tasks; _i < _a.length; _i++) {
            var _b = _a[_i], taskId = _b[0], task = _b[1];
            if (task.parentSessionId === parentSessionId && (task.status === 'running' || task.status === 'queued')) {
                if (this.cancelTask(taskId))
                    cancelled++;
            }
        }
        return cancelled;
    };
    SubagentManager.prototype.drainQueue = function () {
        var maxConcurrent = (0, index_js_1.getConfig)().acpMaxConcurrent;
        while (this.running < maxConcurrent && this.queue.length > 0) {
            var item = this.queue.shift();
            this.runTask(item.task, item.model);
        }
    };
    return SubagentManager;
}(node_events_1.EventEmitter));
var _manager = null;
function getSubagentManager() {
    if (!_manager) {
        _manager = new SubagentManager();
    }
    return _manager;
}
