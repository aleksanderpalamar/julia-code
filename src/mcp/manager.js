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
exports.initMcpServers = initMcpServers;
exports.shutdownMcpServers = shutdownMcpServers;
exports.getMcpServerStatuses = getMcpServerStatuses;
exports.addMcpServer = addMcpServer;
exports.removeMcpServer = removeMcpServer;
var client_js_1 = require("./client.js");
var registry_js_1 = require("../tools/registry.js");
var index_js_1 = require("../config/index.js");
var clients = [];
function initMcpServers() {
    return __awaiter(this, void 0, void 0, function () {
        var settings, mcpServers, entries, connectPromises;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    settings = (0, index_js_1.getSettings)();
                    mcpServers = settings === null || settings === void 0 ? void 0 : settings.mcpServers;
                    if (!mcpServers)
                        return [2 /*return*/];
                    entries = Object.entries(mcpServers);
                    if (entries.length === 0)
                        return [2 /*return*/];
                    connectPromises = entries.map(function (_a) { return __awaiter(_this, [_a], void 0, function (_b) {
                        var client, tools, _loop_1, _i, tools_1, mcpTool, err_1, msg, idx;
                        var _this = this;
                        var serverName = _b[0], config = _b[1];
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    client = new client_js_1.McpClient(serverName, config);
                                    clients.push(client);
                                    _c.label = 1;
                                case 1:
                                    _c.trys.push([1, 3, , 4]);
                                    return [4 /*yield*/, client.connect()];
                                case 2:
                                    _c.sent();
                                    tools = client.getTools();
                                    _loop_1 = function (mcpTool) {
                                        var toolDef = {
                                            name: "mcp__".concat(serverName, "__").concat(mcpTool.name),
                                            description: "[MCP:".concat(serverName, "] ").concat(mcpTool.description),
                                            parameters: mcpTool.inputSchema,
                                            execute: function (args) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                                return [2 /*return*/, client.callTool(mcpTool.name, args)];
                                            }); }); },
                                        };
                                        (0, registry_js_1.registerTool)(toolDef);
                                    };
                                    for (_i = 0, tools_1 = tools; _i < tools_1.length; _i++) {
                                        mcpTool = tools_1[_i];
                                        _loop_1(mcpTool);
                                    }
                                    process.stderr.write("[mcp] Connected to '".concat(serverName, "': ").concat(tools.length, " tools\n"));
                                    return [3 /*break*/, 4];
                                case 3:
                                    err_1 = _c.sent();
                                    msg = err_1 instanceof Error ? err_1.message : String(err_1);
                                    process.stderr.write("[mcp] Failed to connect to '".concat(serverName, "': ").concat(msg, "\n"));
                                    idx = clients.indexOf(client);
                                    if (idx !== -1)
                                        clients.splice(idx, 1);
                                    return [3 /*break*/, 4];
                                case 4: return [2 /*return*/];
                            }
                        });
                    }); });
                    return [4 /*yield*/, Promise.allSettled(connectPromises)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function shutdownMcpServers() {
    return __awaiter(this, void 0, void 0, function () {
        var _i, clients_1, client;
        return __generator(this, function (_a) {
            for (_i = 0, clients_1 = clients; _i < clients_1.length; _i++) {
                client = clients_1[_i];
                try {
                    client.close();
                }
                catch (_b) {
                }
            }
            clients.length = 0;
            return [2 /*return*/];
        });
    });
}
function getMcpServerStatuses() {
    return clients.map(function (client) { return ({
        name: client.serverName,
        connected: client.connected,
        toolCount: client.getTools().length,
    }); });
}
function addMcpServer(name, config) {
    return __awaiter(this, void 0, void 0, function () {
        var client, tools, _loop_2, _i, tools_2, mcpTool, err_2, idx;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    client = new client_js_1.McpClient(name, config);
                    clients.push(client);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, client.connect()];
                case 2:
                    _a.sent();
                    tools = client.getTools();
                    _loop_2 = function (mcpTool) {
                        var toolDef = {
                            name: "mcp__".concat(name, "__").concat(mcpTool.name),
                            description: "[MCP:".concat(name, "] ").concat(mcpTool.description),
                            parameters: mcpTool.inputSchema,
                            execute: function (args) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                return [2 /*return*/, client.callTool(mcpTool.name, args)];
                            }); }); },
                        };
                        (0, registry_js_1.registerTool)(toolDef);
                    };
                    for (_i = 0, tools_2 = tools; _i < tools_2.length; _i++) {
                        mcpTool = tools_2[_i];
                        _loop_2(mcpTool);
                    }
                    return [2 /*return*/, { success: true, toolCount: tools.length }];
                case 3:
                    err_2 = _a.sent();
                    idx = clients.indexOf(client);
                    if (idx !== -1)
                        clients.splice(idx, 1);
                    return [2 /*return*/, {
                            success: false,
                            error: err_2 instanceof Error ? err_2.message : String(err_2),
                        }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function removeMcpServer(name) {
    var idx = clients.findIndex(function (c) { return c.serverName === name; });
    if (idx !== -1) {
        try {
            clients[idx].close();
        }
        catch (_a) {
        }
        clients.splice(idx, 1);
    }
    (0, registry_js_1.unregisterToolsByPrefix)("mcp__".concat(name, "__"));
}
