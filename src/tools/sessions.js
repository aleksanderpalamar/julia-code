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
exports.sessionsTool = void 0;
var manager_js_1 = require("../session/manager.js");
exports.sessionsTool = {
    name: 'sessions',
    description: 'Manage your own saved sessions. Actions: "list" returns all sessions, "messages" returns messages from a session, "count" returns message count.',
    parameters: {
        type: 'object',
        properties: {
            action: {
                type: 'string',
                enum: ['list', 'messages', 'count'],
                description: 'Action to perform',
            },
            session_id: {
                type: 'string',
                description: 'Session ID (required for "messages" and "count")',
            },
            after_id: {
                type: 'number',
                description: 'Only return messages after this message ID (for pagination)',
            },
        },
        required: ['action'],
    },
    execute: function (args) {
        return __awaiter(this, void 0, void 0, function () {
            var action, sessions, lines, sessionId, afterId, messages, lines, sessionId, count;
            return __generator(this, function (_a) {
                action = args.action;
                switch (action) {
                    case 'list': {
                        sessions = (0, manager_js_1.listSessions)();
                        if (sessions.length === 0) {
                            return [2 /*return*/, { success: true, output: 'No sessions found.' }];
                        }
                        lines = sessions.map(function (s) {
                            return "".concat(s.id, " | ").concat(s.title, " | ").concat(s.model, " | created: ").concat(s.created_at, " | updated: ").concat(s.updated_at);
                        });
                        return [2 /*return*/, { success: true, output: "".concat(sessions.length, " sessions:\n").concat(lines.join('\n')) }];
                    }
                    case 'messages': {
                        sessionId = args.session_id;
                        if (!sessionId) {
                            return [2 /*return*/, { success: false, output: '', error: 'session_id is required for "messages" action' }];
                        }
                        afterId = args.after_id;
                        messages = (0, manager_js_1.getMessages)(sessionId, afterId);
                        if (messages.length === 0) {
                            return [2 /*return*/, { success: true, output: 'No messages found.' }];
                        }
                        lines = messages.map(function (m) {
                            var preview = m.content.length > 200 ? m.content.slice(0, 200) + '...' : m.content;
                            return "[".concat(m.id, "] ").concat(m.role, ": ").concat(preview);
                        });
                        return [2 /*return*/, { success: true, output: "".concat(messages.length, " messages:\n").concat(lines.join('\n')) }];
                    }
                    case 'count': {
                        sessionId = args.session_id;
                        if (!sessionId) {
                            return [2 /*return*/, { success: false, output: '', error: 'session_id is required for "count" action' }];
                        }
                        count = (0, manager_js_1.getMessageCount)(sessionId);
                        return [2 /*return*/, { success: true, output: "".concat(count, " messages in session ").concat(sessionId) }];
                    }
                    default:
                        return [2 /*return*/, { success: false, output: '', error: "Unknown action: ".concat(action, ". Use \"list\", \"messages\", or \"count\".") }];
                }
                return [2 /*return*/];
            });
        });
    },
};
