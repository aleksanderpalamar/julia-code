import { McpClient } from './client.js';
import { registerTool, unregisterToolsByPrefix } from '../tools/registry.js';
import { getSettings } from '../config/index.js';
import type { ToolDefinition } from '../tools/types.js';
import type { McpServerConfig } from '../config/types.js';

const clients: McpClient[] = [];

export async function initMcpServers(): Promise<void> {
  const settings = getSettings();
  const mcpServers = settings?.mcpServers;
  if (!mcpServers) return;

  const entries = Object.entries(mcpServers);
  if (entries.length === 0) return;

  const connectPromises = entries.map(async ([serverName, config]) => {
    const client = new McpClient(serverName, config);
    clients.push(client);

    try {
      await client.connect();

      const tools = client.getTools();
      for (const mcpTool of tools) {
        const toolDef: ToolDefinition = {
          name: `mcp__${serverName}__${mcpTool.name}`,
          description: `[MCP:${serverName}] ${mcpTool.description}`,
          parameters: mcpTool.inputSchema,
          execute: async (args) => client.callTool(mcpTool.name, args),
        };
        registerTool(toolDef);
      }

      process.stderr.write(`[mcp] Connected to '${serverName}': ${tools.length} tools\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[mcp] Failed to connect to '${serverName}': ${msg}\n`);
      const idx = clients.indexOf(client);
      if (idx !== -1) clients.splice(idx, 1);
    }
  });

  await Promise.allSettled(connectPromises);
}

export async function shutdownMcpServers(): Promise<void> {
  for (const client of clients) {
    try {
      client.close();
    } catch {
    }
  }
  clients.length = 0;
}

export function getMcpServerStatuses(): Array<{ name: string; connected: boolean; toolCount: number }> {
  return clients.map(client => ({
    name: client.serverName,
    connected: client.connected,
    toolCount: client.getTools().length,
  }));
}

export async function addMcpServer(
  name: string,
  config: McpServerConfig,
): Promise<{ success: boolean; toolCount?: number; error?: string }> {
  const client = new McpClient(name, config);
  clients.push(client);

  try {
    await client.connect();

    const tools = client.getTools();
    for (const mcpTool of tools) {
      const toolDef: ToolDefinition = {
        name: `mcp__${name}__${mcpTool.name}`,
        description: `[MCP:${name}] ${mcpTool.description}`,
        parameters: mcpTool.inputSchema,
        execute: async (args) => client.callTool(mcpTool.name, args),
      };
      registerTool(toolDef);
    }

    return { success: true, toolCount: tools.length };
  } catch (err) {
    const idx = clients.indexOf(client);
    if (idx !== -1) clients.splice(idx, 1);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function removeMcpServer(name: string): void {
  const idx = clients.findIndex(c => c.serverName === name);
  if (idx !== -1) {
    try {
      clients[idx].close();
    } catch {
    }
    clients.splice(idx, 1);
  }
  unregisterToolsByPrefix(`mcp__${name}__`);
}
