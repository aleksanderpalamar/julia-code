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
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
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
exports.McpTransport = void 0;
var node_child_process_1 = require("node:child_process");
var node_events_1 = require("node:events");
var permissions_js_1 = require("../security/permissions.js");
var REQUEST_TIMEOUT_MS = 30000;
var MCP_COMMAND_ALLOWLIST = new Set([
    'npx', 'node', 'python', 'python3', 'uvx', 'uv', 'deno', 'bun',
]);
var McpTransport = /** @class */ (function (_super) {
    __extends(McpTransport, _super);
    function McpTransport(command, args, env) {
        var _this = _super.call(this) || this;
        _this.command = command;
        _this.args = args;
        _this.env = env;
        _this.child = null;
        _this.pending = new Map();
        _this.nextId = 1;
        _this.buffer = '';
        _this._closed = false;
        return _this;
    }
    McpTransport.prototype.start = function () {
        var _this = this;
        var _a;
        var baseCommand = (_a = this.command.split('/').pop()) !== null && _a !== void 0 ? _a : this.command;
        if (!MCP_COMMAND_ALLOWLIST.has(baseCommand)) {
            throw new Error("Comando MCP n\u00E3o permitido: \"".concat(this.command, "\". Permitidos: ").concat(__spreadArray([], MCP_COMMAND_ALLOWLIST, true).join(', ')));
        }
        var safeEnv = (0, permissions_js_1.buildSafeEnv)(this.env);
        this.child = (0, node_child_process_1.spawn)(this.command, this.args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: safeEnv,
        });
        this.child.stdout.on('data', function (chunk) {
            _this.buffer += chunk.toString();
            _this.processBuffer();
        });
        this.child.stderr.on('data', function (chunk) {
            var lines = chunk.toString().trim();
            if (lines) {
                for (var _i = 0, _a = lines.split('\n'); _i < _a.length; _i++) {
                    var line = _a[_i];
                    process.stderr.write("[mcp:".concat(_this.command, "] ").concat(line, "\n"));
                }
            }
        });
        this.child.on('error', function (err) {
            _this.rejectAll(err);
            _this._closed = true;
            _this.emit('error', err);
        });
        this.child.on('exit', function (code) {
            _this.rejectAll(new Error("MCP server exited with code ".concat(code)));
            _this._closed = true;
            _this.emit('close', code);
        });
    };
    Object.defineProperty(McpTransport.prototype, "closed", {
        get: function () {
            return this._closed;
        },
        enumerable: false,
        configurable: true
    });
    McpTransport.prototype.send = function (method, params) {
        var _this = this;
        if (this._closed || !this.child) {
            return Promise.reject(new Error('Transport is closed'));
        }
        var id = this.nextId++;
        var request = __assign({ jsonrpc: '2.0', id: id, method: method }, (params !== undefined && { params: params }));
        return new Promise(function (resolve, reject) {
            var timer = setTimeout(function () {
                _this.pending.delete(id);
                reject(new Error("MCP request '".concat(method, "' timed out after ").concat(REQUEST_TIMEOUT_MS, "ms")));
            }, REQUEST_TIMEOUT_MS);
            _this.pending.set(id, { resolve: resolve, reject: reject, timer: timer });
            _this.child.stdin.write(JSON.stringify(request) + '\n');
        });
    };
    McpTransport.prototype.notify = function (method, params) {
        if (this._closed || !this.child)
            return;
        var notification = __assign({ jsonrpc: '2.0', method: method }, (params !== undefined && { params: params }));
        this.child.stdin.write(JSON.stringify(notification) + '\n');
    };
    McpTransport.prototype.close = function () {
        if (this._closed)
            return;
        this._closed = true;
        this.rejectAll(new Error('Transport closed'));
        if (this.child) {
            this.child.stdin.end();
            this.child.kill();
            this.child = null;
        }
    };
    McpTransport.prototype.processBuffer = function () {
        var _a;
        var lines = this.buffer.split('\n');
        this.buffer = (_a = lines.pop()) !== null && _a !== void 0 ? _a : '';
        for (var _i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
            var line = lines_1[_i];
            var trimmed = line.trim();
            if (!trimmed)
                continue;
            try {
                var msg = JSON.parse(trimmed);
                if (msg.id !== undefined && this.pending.has(msg.id)) {
                    var pending = this.pending.get(msg.id);
                    this.pending.delete(msg.id);
                    clearTimeout(pending.timer);
                    if (msg.error) {
                        pending.reject(new Error("JSON-RPC error ".concat(msg.error.code, ": ").concat(msg.error.message)));
                    }
                    else {
                        pending.resolve(msg.result);
                    }
                }
            }
            catch (_b) {
            }
        }
    };
    McpTransport.prototype.rejectAll = function (error) {
        for (var _i = 0, _a = this.pending; _i < _a.length; _i++) {
            var _b = _a[_i], id = _b[0], pending = _b[1];
            clearTimeout(pending.timer);
            pending.reject(error);
        }
        this.pending.clear();
    };
    return McpTransport;
}(node_events_1.EventEmitter));
exports.McpTransport = McpTransport;
