"use strict";
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
exports.fetchTool = void 0;
var boundaries_js_1 = require("../security/boundaries.js");
var network_js_1 = require("../security/network.js");
exports.fetchTool = {
    name: 'fetch',
    description: 'Fetch a URL and return its content. Supports HTML pages (returns text), JSON APIs, and plain text. Useful for accessing the internet, reading documentation, or calling APIs.',
    parameters: {
        type: 'object',
        properties: {
            url: {
                type: 'string',
                description: 'The URL to fetch',
            },
            method: {
                type: 'string',
                description: 'HTTP method (default: GET)',
            },
            headers: {
                type: 'object',
                description: 'Optional HTTP headers as key-value pairs',
            },
            body: {
                type: 'string',
                description: 'Optional request body (for POST/PUT)',
            },
            max_length: {
                type: 'number',
                description: 'Max response length in characters (default: 20000)',
            },
        },
        required: ['url'],
    },
    execute: function (args) {
        return __awaiter(this, void 0, void 0, function () {
            var url, method, headers, body, maxLength, controller_1, timeout, res, contentType, text, statusInfo, wrappedContent, err_1, message;
            var _a, _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        url = args.url;
                        method = (_a = args.method) !== null && _a !== void 0 ? _a : 'GET';
                        headers = (_b = args.headers) !== null && _b !== void 0 ? _b : {};
                        body = args.body;
                        maxLength = (_c = args.max_length) !== null && _c !== void 0 ? _c : 20000;
                        try {
                            (0, network_js_1.validateUrl)(url);
                        }
                        catch (err) {
                            return [2 /*return*/, {
                                    success: false,
                                    output: '',
                                    error: err instanceof Error ? err.message : String(err),
                                }];
                        }
                        _e.label = 1;
                    case 1:
                        _e.trys.push([1, 4, , 5]);
                        controller_1 = new AbortController();
                        timeout = setTimeout(function () { return controller_1.abort(); }, 30000);
                        return [4 /*yield*/, fetch(url, {
                                method: method,
                                headers: __assign({ 'User-Agent': 'JuliaCode/0.1' }, headers),
                                body: method !== 'GET' && method !== 'HEAD' ? body : undefined,
                                signal: controller_1.signal,
                            })];
                    case 2:
                        res = _e.sent();
                        clearTimeout(timeout);
                        contentType = (_d = res.headers.get('content-type')) !== null && _d !== void 0 ? _d : '';
                        return [4 /*yield*/, res.text()];
                    case 3:
                        text = _e.sent();
                        if (contentType.includes('text/html')) {
                            text = htmlToText(text);
                        }
                        if (text.length > maxLength) {
                            text = text.slice(0, maxLength) + '\n\n[... truncated]';
                        }
                        statusInfo = "HTTP ".concat(res.status, " ").concat(res.statusText);
                        wrappedContent = (0, boundaries_js_1.wrapExternalContent)(url, "".concat(statusInfo, "\n\n").concat(text.trim()));
                        return [2 /*return*/, {
                                success: res.ok,
                                output: wrappedContent,
                                error: res.ok ? undefined : statusInfo,
                            }];
                    case 4:
                        err_1 = _e.sent();
                        message = err_1 instanceof Error ? err_1.message : String(err_1);
                        return [2 /*return*/, {
                                success: false,
                                output: '',
                                error: message.includes('abort') ? 'Request timed out (30s)' : message,
                            }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    },
};
function htmlToText(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<header[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<\/(p|div|h[1-6]|li|tr|br|hr)[^>]*>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
