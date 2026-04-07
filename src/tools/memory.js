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
exports.memoryTool = void 0;
exports.setCurrentSessionId = setCurrentSessionId;
var manager_js_1 = require("../session/manager.js");
var currentSessionId;
function setCurrentSessionId(id) {
    currentSessionId = id;
}
exports.memoryTool = {
    name: 'memory',
    description: 'Manage your long-term memories that persist across sessions. Actions: "save" stores a memory (upsert by key), "recall" searches memories by query, "list" lists all memories, "delete" removes a memory by key.',
    parameters: {
        type: 'object',
        properties: {
            action: {
                type: 'string',
                enum: ['save', 'recall', 'list', 'delete'],
                description: 'Action to perform',
            },
            key: {
                type: 'string',
                description: 'Short kebab-case identifier for the memory (required for save/delete)',
            },
            content: {
                type: 'string',
                description: 'The memory content to save (required for save)',
            },
            category: {
                type: 'string',
                enum: ['user', 'project', 'pattern', 'general'],
                description: 'Memory category (optional, default: general)',
            },
            query: {
                type: 'string',
                description: 'Search query (required for recall)',
            },
        },
        required: ['action'],
    },
    execute: function (args) {
        return __awaiter(this, void 0, void 0, function () {
            var action, key, content, category, memory, query, category, memories, lines, category, memories, lines, key, deleted;
            return __generator(this, function (_a) {
                action = args.action;
                switch (action) {
                    case 'save': {
                        key = args.key;
                        content = args.content;
                        if (!key || !content) {
                            return [2 /*return*/, { success: false, output: '', error: '"key" and "content" are required for save action' }];
                        }
                        category = args.category || 'general';
                        memory = (0, manager_js_1.saveMemory)(key, content, category, currentSessionId);
                        return [2 /*return*/, { success: true, output: "Memory saved: [".concat(memory.category, "] ").concat(memory.key) }];
                    }
                    case 'recall': {
                        query = args.query;
                        if (!query) {
                            return [2 /*return*/, { success: false, output: '', error: '"query" is required for recall action' }];
                        }
                        category = args.category;
                        memories = (0, manager_js_1.searchMemories)(query, category);
                        if (memories.length === 0) {
                            return [2 /*return*/, { success: true, output: 'No memories found matching that query.' }];
                        }
                        lines = memories.map(function (m) {
                            return "[".concat(m.category, "] **").concat(m.key, "**: ").concat(m.content, " (updated: ").concat(m.updated_at, ")");
                        });
                        return [2 /*return*/, { success: true, output: "".concat(memories.length, " memories found:\n").concat(lines.join('\n')) }];
                    }
                    case 'list': {
                        category = args.category;
                        memories = (0, manager_js_1.listMemories)(category);
                        if (memories.length === 0) {
                            return [2 /*return*/, { success: true, output: 'No memories stored yet.' }];
                        }
                        lines = memories.map(function (m) {
                            return "[".concat(m.category, "] **").concat(m.key, "**: ").concat(m.content);
                        });
                        return [2 /*return*/, { success: true, output: "".concat(memories.length, " memories:\n").concat(lines.join('\n')) }];
                    }
                    case 'delete': {
                        key = args.key;
                        if (!key) {
                            return [2 /*return*/, { success: false, output: '', error: '"key" is required for delete action' }];
                        }
                        deleted = (0, manager_js_1.deleteMemory)(key);
                        return [2 /*return*/, deleted
                                ? { success: true, output: "Memory \"".concat(key, "\" deleted.") }
                                : { success: false, output: '', error: "Memory \"".concat(key, "\" not found.") }];
                    }
                    default:
                        return [2 /*return*/, { success: false, output: '', error: "Unknown action: ".concat(action, ". Use \"save\", \"recall\", \"list\", or \"delete\".") }];
                }
                return [2 /*return*/];
            });
        });
    },
};
