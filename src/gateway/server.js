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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startGateway = startGateway;
var node_http_1 = require("node:http");
var index_js_1 = require("../config/index.js");
var loop_js_1 = require("../agent/loop.js");
var queue_js_1 = require("../agent/queue.js");
var manager_js_1 = require("../session/manager.js");
var agent = new loop_js_1.AgentLoop();
var queue = new queue_js_1.AgentQueue(agent);
function startGateway(options) {
    var _this = this;
    var _a, _b;
    if (options === void 0) { options = {}; }
    var host = (_a = options.host) !== null && _a !== void 0 ? _a : '127.0.0.1';
    var port = (_b = options.port) !== null && _b !== void 0 ? _b : 18800;
    var server = (0, node_http_1.createServer)(function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var err_1, message;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
                    if (req.method === 'OPTIONS') {
                        res.writeHead(204);
                        res.end();
                        return [2 /*return*/];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, route(req, res)];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    err_1 = _a.sent();
                    message = err_1 instanceof Error ? err_1.message : String(err_1);
                    json(res, 500, { error: message });
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    server.on('error', function (err) {
        if (err.code === 'EADDRINUSE') {
            console.error("Port ".concat(port, " is already in use. Try a different port with --port <number>"));
            process.exit(1);
        }
        throw err;
    });
    server.listen(port, host, function () {
        console.log("Gateway listening on http://".concat(host, ":").concat(port));
    });
    return server;
}
function route(req, res) {
    return __awaiter(this, void 0, void 0, function () {
        var url, path, method, body, session, sessionMatch, session, messagesMatch, session, messages, body, sessionId, model, message, events_1, onChunk, onToolCall, onToolResult, messages, lastAssistant, body, sessionId_1, model, send_1, onThinking, onChunk, onToolCall, onToolResult, onDone, onError;
        var _a, _b, _c, _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    url = new URL((_a = req.url) !== null && _a !== void 0 ? _a : '/', "http://".concat(req.headers.host));
                    path = url.pathname;
                    method = (_b = req.method) !== null && _b !== void 0 ? _b : 'GET';
                    if (method === 'GET' && path === '/health') {
                        return [2 /*return*/, json(res, 200, { status: 'ok', model: (0, index_js_1.getConfig)().defaultModel })];
                    }
                    if (method === 'GET' && path === '/sessions') {
                        return [2 /*return*/, json(res, 200, { sessions: (0, manager_js_1.listSessions)() })];
                    }
                    if (!(method === 'POST' && path === '/sessions')) return [3 /*break*/, 2];
                    return [4 /*yield*/, readBody(req)];
                case 1:
                    body = _h.sent();
                    session = (0, manager_js_1.createSession)(body.title);
                    return [2 /*return*/, json(res, 201, { session: session })];
                case 2:
                    sessionMatch = path.match(/^\/sessions\/([^/]+)$/);
                    if (method === 'GET' && sessionMatch) {
                        session = (0, manager_js_1.getSession)(sessionMatch[1]);
                        if (!session)
                            return [2 /*return*/, json(res, 404, { error: 'Session not found' })];
                        return [2 /*return*/, json(res, 200, { session: session })];
                    }
                    messagesMatch = path.match(/^\/sessions\/([^/]+)\/messages$/);
                    if (method === 'GET' && messagesMatch) {
                        session = (0, manager_js_1.getSession)(messagesMatch[1]);
                        if (!session)
                            return [2 /*return*/, json(res, 404, { error: 'Session not found' })];
                        messages = (0, manager_js_1.getMessages)(session.id);
                        return [2 /*return*/, json(res, 200, { messages: messages })];
                    }
                    if (!(method === 'POST' && path === '/chat')) return [3 /*break*/, 8];
                    return [4 /*yield*/, readBody(req)];
                case 3:
                    body = _h.sent();
                    if (!body.message)
                        return [2 /*return*/, json(res, 400, { error: 'message is required' })];
                    sessionId = (_c = body.session_id) !== null && _c !== void 0 ? _c : (0, manager_js_1.createSession)(body.title).id;
                    model = (_d = body.model) !== null && _d !== void 0 ? _d : (0, index_js_1.getConfig)().defaultModel;
                    message = body.message;
                    events_1 = [];
                    onChunk = function (text) { return events_1.push({ type: 'chunk', data: text }); };
                    onToolCall = function (tc) {
                        return events_1.push({ type: 'tool_call', data: tc.function.name });
                    };
                    onToolResult = function (name, result, success) {
                        return events_1.push({ type: 'tool_result', data: { name: name, result: result.slice(0, 500), success: success } });
                    };
                    agent.on('chunk', onChunk);
                    agent.on('tool_call', onToolCall);
                    agent.on('tool_result', onToolResult);
                    _h.label = 4;
                case 4:
                    _h.trys.push([4, , 6, 7]);
                    return [4 /*yield*/, queue.enqueue(sessionId, message, model)];
                case 5:
                    _h.sent();
                    return [3 /*break*/, 7];
                case 6:
                    agent.off('chunk', onChunk);
                    agent.off('tool_call', onToolCall);
                    agent.off('tool_result', onToolResult);
                    return [7 /*endfinally*/];
                case 7:
                    messages = (0, manager_js_1.getMessages)(sessionId);
                    lastAssistant = __spreadArray([], messages, true).reverse().find(function (m) { return m.role === 'assistant'; });
                    return [2 /*return*/, json(res, 200, {
                            session_id: sessionId,
                            response: (_e = lastAssistant === null || lastAssistant === void 0 ? void 0 : lastAssistant.content) !== null && _e !== void 0 ? _e : '',
                            events: events_1,
                        })];
                case 8:
                    if (!(method === 'POST' && path === '/chat/stream')) return [3 /*break*/, 14];
                    return [4 /*yield*/, readBody(req)];
                case 9:
                    body = _h.sent();
                    if (!body.message)
                        return [2 /*return*/, json(res, 400, { error: 'message is required' })];
                    sessionId_1 = (_f = body.session_id) !== null && _f !== void 0 ? _f : (0, manager_js_1.createSession)(body.title).id;
                    model = (_g = body.model) !== null && _g !== void 0 ? _g : (0, index_js_1.getConfig)().defaultModel;
                    res.writeHead(200, {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                    });
                    send_1 = function (event, data) {
                        res.write("event: ".concat(event, "\ndata: ").concat(JSON.stringify(data), "\n\n"));
                    };
                    onThinking = function () { return send_1('thinking', {}); };
                    onChunk = function (text) { return send_1('chunk', { text: text }); };
                    onToolCall = function (tc) {
                        return send_1('tool_call', { name: tc.function.name });
                    };
                    onToolResult = function (name, result, success) {
                        return send_1('tool_result', { name: name, result: result.slice(0, 500), success: success });
                    };
                    onDone = function (fullText) { return send_1('done', { text: fullText, session_id: sessionId_1 }); };
                    onError = function (error) { return send_1('error', { error: error }); };
                    agent.on('thinking', onThinking);
                    agent.on('chunk', onChunk);
                    agent.on('tool_call', onToolCall);
                    agent.on('tool_result', onToolResult);
                    agent.on('done', onDone);
                    agent.on('error', onError);
                    _h.label = 10;
                case 10:
                    _h.trys.push([10, , 12, 13]);
                    return [4 /*yield*/, queue.enqueue(sessionId_1, body.message, model)];
                case 11:
                    _h.sent();
                    return [3 /*break*/, 13];
                case 12:
                    agent.off('thinking', onThinking);
                    agent.off('chunk', onChunk);
                    agent.off('tool_call', onToolCall);
                    agent.off('tool_result', onToolResult);
                    agent.off('done', onDone);
                    agent.off('error', onError);
                    return [7 /*endfinally*/];
                case 13:
                    res.end();
                    return [2 /*return*/];
                case 14:
                    json(res, 404, { error: 'Not found' });
                    return [2 /*return*/];
            }
        });
    });
}
function json(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}
function readBody(req) {
    return new Promise(function (resolve, reject) {
        var data = '';
        req.on('data', function (chunk) { return (data += chunk); });
        req.on('end', function () {
            try {
                resolve(data ? JSON.parse(data) : {});
            }
            catch (_a) {
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}
