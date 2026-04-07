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
exports.readTool = void 0;
var node_fs_1 = require("node:fs");
var paths_js_1 = require("../security/paths.js");
exports.readTool = {
    name: 'read',
    description: 'Read the contents of a file. Returns the file content as text with line numbers. For large files (200+ lines), use offset and limit to read in sections instead of loading everything at once.',
    parameters: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'Path to the file to read (relative to project directory)',
            },
            offset: {
                type: 'number',
                description: 'Line number to start reading from (1-based)',
            },
            limit: {
                type: 'number',
                description: 'Maximum number of lines to read',
            },
        },
        required: ['path'],
    },
    execute: function (args) {
        return __awaiter(this, void 0, void 0, function () {
            var filePath, content, allLines, totalLines, offset, limit, AUTO_LIMIT, effectiveLimit, lines, wasAutoTruncated, start, startLine_1, numbered, header;
            return __generator(this, function (_a) {
                filePath = (0, paths_js_1.validateReadPath)(args.path);
                try {
                    content = (0, node_fs_1.readFileSync)(filePath, 'utf-8');
                    allLines = content.split('\n');
                    totalLines = allLines.length;
                    offset = args.offset || 1;
                    limit = args.limit;
                    AUTO_LIMIT = 200;
                    effectiveLimit = limit !== null && limit !== void 0 ? limit : (totalLines > AUTO_LIMIT && offset === 1 ? AUTO_LIMIT : undefined);
                    lines = allLines;
                    wasAutoTruncated = false;
                    if (offset > 1 || effectiveLimit) {
                        start = offset - 1;
                        lines = allLines.slice(start, effectiveLimit ? start + effectiveLimit : undefined);
                        wasAutoTruncated = !limit && effectiveLimit === AUTO_LIMIT && totalLines > AUTO_LIMIT;
                    }
                    startLine_1 = offset;
                    numbered = lines.map(function (line, i) { return "".concat(startLine_1 + i, "\t").concat(line); }).join('\n');
                    header = wasAutoTruncated
                        ? "[file: ".concat(filePath, " | lines: ").concat(startLine_1, "-").concat(startLine_1 + lines.length - 1, " of ").concat(totalLines, " \u2014 use offset/limit to read more]\n")
                        : totalLines > AUTO_LIMIT
                            ? "[file: ".concat(filePath, " | showing lines ").concat(startLine_1, "-").concat(startLine_1 + lines.length - 1, " of ").concat(totalLines, "]\n")
                            : '';
                    return [2 /*return*/, { success: true, output: header + numbered }];
                }
                catch (err) {
                    return [2 /*return*/, {
                            success: false,
                            output: '',
                            error: err instanceof Error ? err.message : String(err),
                        }];
                }
                return [2 /*return*/];
            });
        });
    },
};
