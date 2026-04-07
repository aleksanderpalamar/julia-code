#!/usr/bin/env tsx
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
var react_1 = require("react");
var ink_1 = require("ink");
var app_js_1 = require("./src/tui/app.js");
var index_js_1 = require("./src/config/index.js");
var db_js_1 = require("./src/session/db.js");
var registry_js_1 = require("./src/providers/registry.js");
var registry_js_2 = require("./src/tools/registry.js");
var workspace_js_1 = require("./src/config/workspace.js");
var server_js_1 = require("./src/gateway/server.js");
var index_js_2 = require("./src/mcp/index.js");
var mcp_js_1 = require("./src/config/mcp.js");
// Bootstrap
function bootstrap() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    (0, index_js_1.loadConfig)();
                    (0, db_js_1.getDb)(); // Initialize database
                    (0, registry_js_1.initProviders)(); // Register LLM providers
                    return [4 /*yield*/, (0, mcp_js_1.syncAvailableModels)()];
                case 1:
                    _a.sent(); // Populate models.available from Ollama + auto-detect toolModel
                    (0, index_js_1.reloadConfig)(); // Reload config after sync (toolModel may have been auto-configured)
                    (0, registry_js_2.initTools)(); // Register tools
                    (0, workspace_js_1.initWorkspace)(); // Create workspace directory
                    return [4 /*yield*/, (0, index_js_2.initMcpServers)()];
                case 2:
                    _a.sent(); // Connect MCP servers and register their tools
                    return [2 /*return*/];
            }
        });
    });
}
await bootstrap();
// Parse CLI args
var args = process.argv.slice(2);
var sessionId;
var mode = 'tui';
var gatewayPort = 18800;
var gatewayHost = '127.0.0.1';
for (var i = 0; i < args.length; i++) {
    if ((args[i] === '--session' || args[i] === '-s') && args[i + 1]) {
        sessionId = args[++i];
    }
    if (args[i] === '--gateway' || args[i] === '-g') {
        mode = 'gateway';
    }
    if (args[i] === '--port' && args[i + 1]) {
        gatewayPort = Number(args[++i]);
    }
    if (args[i] === '--host' && args[i + 1]) {
        gatewayHost = args[++i];
    }
}
if (mode === 'gateway') {
    // Run as HTTP gateway daemon
    (0, server_js_1.startGateway)({ host: gatewayHost, port: gatewayPort });
}
else {
    // Run TUI
    var waitUntilExit = (0, ink_1.render)(react_1.default.createElement(app_js_1.App, { sessionId: sessionId })).waitUntilExit;
    waitUntilExit().then(function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, index_js_2.shutdownMcpServers)()];
                case 1:
                    _a.sent();
                    (0, db_js_1.closeDb)();
                    process.exit(0);
                    return [2 /*return*/];
            }
        });
    }); });
}
