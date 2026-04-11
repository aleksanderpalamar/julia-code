import { z } from 'zod';

export const ConfigSchema = z.object({
  ollamaHost: z.string().default('http://localhost:11434'),
  defaultModel: z.string().default('qwen3:8b'),
  maxToolIterations: z.number().default(25),
  dbPath: z.string().default('./data/julia.db'),
  compactionThreshold: z.number().default(6000),   // estimated tokens before triggering compaction
  compactionKeepRecent: z.number().default(6),      // number of recent messages to keep uncompacted
  workspace: z.string().default(''),                // workspace root (empty = cwd)
  acpEnabled: z.boolean().default(true),
  acpAutoOrchestrate: z.boolean().default(true),  // auto-detect complex tasks and spawn subagents
  acpMaxConcurrent: z.number().default(3),
  acpSubagentMaxIterations: z.number().default(20),
  acpDefaultModel: z.string().nullable().default(null),
  acpCancelOnFailure: z.boolean().default(false),
  acpWorktreeIsolation: z.boolean().default(true),
  toolModel: z.string().nullable().default(null),
  defaultTemperament: z.enum(['neutral', 'sharp', 'warm', 'auto']).default('neutral'),
  contextReservePercent: z.number().default(0.15),
  contextEmergencyThreshold: z.number().default(0.90),
  contextMaxToolResultTokens: z.number().default(3000),
});

export type Config = z.infer<typeof ConfigSchema>;

export const SettingsModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  contextWindow: z.number().optional(),
  isCloud: z.boolean().optional(),
  supportsTools: z.boolean().optional(),
});

export const McpServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).optional(),
});

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

export const SettingsSchema = z.object({
  meta: z.object({
    version: z.string(),
  }).optional(),
  models: z.object({
    provider: z.string().default('ollama'),
    baseUrl: z.string().default('http://localhost:11434'),
    default: z.string().default('qwen3:8b'),
    toolModel: z.string().nullable().default(null),
    available: z.array(SettingsModelSchema).default([]),
  }).optional(),
  agent: z.object({
    maxToolIterations: z.number().default(25),
  }).optional(),
  session: z.object({
    compactionThreshold: z.number().default(6000),
    compactionKeepRecent: z.number().default(6),
  }).optional(),
  storage: z.object({
    dbPath: z.string().default('./data/julia.db'),
  }).optional(),
  workspace: z.string().optional(),
  trustedDirectories: z.array(z.string()).optional(),
  acp: z.object({
    enabled: z.boolean().default(true),
    autoOrchestrate: z.boolean().default(true),
    maxConcurrent: z.number().default(3),
    subagentMaxIterations: z.number().default(15),
    defaultModel: z.string().nullable().default(null),
    cancelOnFailure: z.boolean().default(false),
    worktreeIsolation: z.boolean().default(true),
  }).optional(),
  temperament: z.object({
    default: z.enum(['neutral', 'sharp', 'warm', 'auto']).default('neutral'),
  }).optional(),
  context: z.object({
    reservePercent: z.number().default(0.15),
    emergencyThreshold: z.number().default(0.90),
    maxToolResultTokens: z.number().default(3000),
  }).optional(),
  mcpServers: z.record(McpServerConfigSchema).optional(),
  security: z.object({
    allowRules: z.array(z.object({
      tool: z.string(),
      pattern: z.string(),
    })).default([]),
  }).optional(),
});

export type Settings = z.infer<typeof SettingsSchema>;
