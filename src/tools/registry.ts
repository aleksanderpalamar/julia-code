import { AsyncLocalStorage } from 'node:async_hooks';
import type { ToolDefinition, ToolResult, ToolContext } from './types.js';
import type { ToolSchema } from '../providers/types.js';
import type { ToolParameterSchema } from './validation.js';
import { toolToSchema } from './types.js';
import { getProjectDir } from '../config/workspace.js';

import { execTool } from './exec.js';
import { readTool } from './read.js';
import { writeTool } from './write.js';
import { editTool } from './edit.js';
import { globTool } from './glob.js';
import { grepTool } from './grep.js';
import { fetchTool } from './fetch.js';
import { sessionsTool } from './sessions.js';
import { memoryTool } from './memory.js';
import { subagentTool } from './subagent.js';

const tools = new Map<string, ToolDefinition>();

export const toolContextStorage = new AsyncLocalStorage<ToolContext>();

export function getActiveToolContext(): ToolContext {
  return toolContextStorage.getStore() ?? {
    projectDir: getProjectDir(),
    isWorktree: false,
  };
}

export function registerTool(tool: ToolDefinition): void {
  tools.set(tool.name, tool);
}

export function getToolSchemas(): ToolSchema[] {
  return Array.from(tools.values()).map(toolToSchema);
}

/**
 * Returns the JSON Schema describing a tool's parameters, or null if the tool
 * is unknown. Used to validate tool-call arguments before execution. The cast
 * is a single typed boundary: every registered tool's `parameters` is authored
 * as the JSON Schema subset that {@link ToolParameterSchema} models.
 */
export function getToolParameters(name: string): ToolParameterSchema | null {
  const tool = tools.get(name);
  return tool ? (tool.parameters as ToolParameterSchema) : null;
}

/** Returns the provider-facing schema for a single tool, or null if unknown. */
export function getToolSchema(name: string): ToolSchema | null {
  const tool = tools.get(name);
  return tool ? toolToSchema(tool) : null;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  trace?: Pick<ToolContext, 'sessionId' | 'turnId'>,
): Promise<ToolResult> {
  const tool = tools.get(name);
  if (!tool) {
    return { success: false, output: '', error: `Unknown tool: ${name}` };
  }

  try {
    const context = { ...getActiveToolContext(), ...trace };
    return await tool.execute(args, context);
  } catch (err) {
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function unregisterToolsByPrefix(prefix: string): number {
  let count = 0;
  for (const name of tools.keys()) {
    if (name.startsWith(prefix)) {
      tools.delete(name);
      count++;
    }
  }
  return count;
}

export function initTools(): void {
  registerTool(execTool);
  registerTool(readTool);
  registerTool(writeTool);
  registerTool(editTool);
  registerTool(globTool);
  registerTool(grepTool);
  registerTool(fetchTool);
  registerTool(sessionsTool);
  registerTool(memoryTool);

  registerTool(subagentTool);
}
