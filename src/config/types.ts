import { z } from 'zod';

export const ConfigSchema = z.object({
  ollamaHost: z.string().default('http://localhost:11434'),
  defaultModel: z.string().default('qwen3:8b'),
  maxToolIterations: z.number().default(10),
  dbPath: z.string().default('./data/julia.db'),
  compactionThreshold: z.number().default(6000),   // estimated tokens before triggering compaction
  compactionKeepRecent: z.number().default(6),      // number of recent messages to keep uncompacted
  workspace: z.string().default(''),                // workspace root (empty = cwd)
  // ACP — subagent coordination
  acpEnabled: z.boolean().default(false),
  acpAutoOrchestrate: z.boolean().default(false),  // auto-detect complex tasks and spawn subagents
  acpMaxConcurrent: z.number().default(3),
  acpSubagentMaxIterations: z.number().default(15),
  acpDefaultModel: z.string().nullable().default(null),
  defaultTemperament: z.enum(['neutral', 'sharp', 'warm', 'auto']).default('neutral'),
});

export type Config = z.infer<typeof ConfigSchema>;

// Schema for ~/.juliacode/settings.json
export const SettingsModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  contextWindow: z.number().optional(),
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
    available: z.array(SettingsModelSchema).default([]),
  }).optional(),
  agent: z.object({
    maxToolIterations: z.number().default(10),
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
    enabled: z.boolean().default(false),
    autoOrchestrate: z.boolean().default(false),
    maxConcurrent: z.number().default(3),
    subagentMaxIterations: z.number().default(15),
    defaultModel: z.string().nullable().default(null),
  }).optional(),
  temperament: z.object({
    default: z.enum(['neutral', 'sharp', 'warm', 'auto']).default('neutral'),
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
