"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsSchema = exports.McpServerConfigSchema = exports.SettingsModelSchema = exports.ConfigSchema = void 0;
var zod_1 = require("zod");
exports.ConfigSchema = zod_1.z.object({
    ollamaHost: zod_1.z.string().default('http://localhost:11434'),
    defaultModel: zod_1.z.string().default('qwen3:8b'),
    maxToolIterations: zod_1.z.number().default(25),
    dbPath: zod_1.z.string().default('./data/julia.db'),
    compactionThreshold: zod_1.z.number().default(6000), // estimated tokens before triggering compaction
    compactionKeepRecent: zod_1.z.number().default(6), // number of recent messages to keep uncompacted
    workspace: zod_1.z.string().default(''), // workspace root (empty = cwd)
    acpEnabled: zod_1.z.boolean().default(true),
    acpAutoOrchestrate: zod_1.z.boolean().default(true), // auto-detect complex tasks and spawn subagents
    acpMaxConcurrent: zod_1.z.number().default(3),
    acpSubagentMaxIterations: zod_1.z.number().default(20),
    acpDefaultModel: zod_1.z.string().nullable().default(null),
    acpCancelOnFailure: zod_1.z.boolean().default(false),
    toolModel: zod_1.z.string().nullable().default(null),
    defaultTemperament: zod_1.z.enum(['neutral', 'sharp', 'warm', 'auto']).default('neutral'),
    contextReservePercent: zod_1.z.number().default(0.15),
    contextEmergencyThreshold: zod_1.z.number().default(0.90),
    contextMaxToolResultTokens: zod_1.z.number().default(3000),
});
exports.SettingsModelSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string().optional(),
    contextWindow: zod_1.z.number().optional(),
    isCloud: zod_1.z.boolean().optional(),
    supportsTools: zod_1.z.boolean().optional(),
});
exports.McpServerConfigSchema = zod_1.z.object({
    command: zod_1.z.string(),
    args: zod_1.z.array(zod_1.z.string()).default([]),
    env: zod_1.z.record(zod_1.z.string()).optional(),
});
exports.SettingsSchema = zod_1.z.object({
    meta: zod_1.z.object({
        version: zod_1.z.string(),
    }).optional(),
    models: zod_1.z.object({
        provider: zod_1.z.string().default('ollama'),
        baseUrl: zod_1.z.string().default('http://localhost:11434'),
        default: zod_1.z.string().default('qwen3:8b'),
        toolModel: zod_1.z.string().nullable().default(null),
        available: zod_1.z.array(exports.SettingsModelSchema).default([]),
    }).optional(),
    agent: zod_1.z.object({
        maxToolIterations: zod_1.z.number().default(25),
    }).optional(),
    session: zod_1.z.object({
        compactionThreshold: zod_1.z.number().default(6000),
        compactionKeepRecent: zod_1.z.number().default(6),
    }).optional(),
    storage: zod_1.z.object({
        dbPath: zod_1.z.string().default('./data/julia.db'),
    }).optional(),
    workspace: zod_1.z.string().optional(),
    trustedDirectories: zod_1.z.array(zod_1.z.string()).optional(),
    acp: zod_1.z.object({
        enabled: zod_1.z.boolean().default(true),
        autoOrchestrate: zod_1.z.boolean().default(true),
        maxConcurrent: zod_1.z.number().default(3),
        subagentMaxIterations: zod_1.z.number().default(15),
        defaultModel: zod_1.z.string().nullable().default(null),
        cancelOnFailure: zod_1.z.boolean().default(false),
    }).optional(),
    temperament: zod_1.z.object({
        default: zod_1.z.enum(['neutral', 'sharp', 'warm', 'auto']).default('neutral'),
    }).optional(),
    context: zod_1.z.object({
        reservePercent: zod_1.z.number().default(0.15),
        emergencyThreshold: zod_1.z.number().default(0.90),
        maxToolResultTokens: zod_1.z.number().default(3000),
    }).optional(),
    mcpServers: zod_1.z.record(exports.McpServerConfigSchema).optional(),
    security: zod_1.z.object({
        allowRules: zod_1.z.array(zod_1.z.object({
            tool: zod_1.z.string(),
            pattern: zod_1.z.string(),
        })).default([]),
    }).optional(),
});
