import { AsyncLocalStorage } from 'node:async_hooks';
import type { ToolDefinition, ToolResult, ToolContext } from './types.js';
import type { ToolSchema } from '../providers/types.js';
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

export function getTool(name: string): ToolDefinition | undefined {
  return tools.get(name);
}

export function getToolSchemas(): ToolSchema[] {
  return Array.from(tools.values()).map(toolToSchema);
}

export async function executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const tool = tools.get(name);
  if (!tool) {
    return { success: false, output: '', error: `Unknown tool: ${name}` };
  }

  try {
    const context = getActiveToolContext();
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
