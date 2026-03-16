import { McpClient } from './client.js';
import { registerTool } from '../tools/registry.js';
import { getSettings } from '../config/index.js';
import type { ToolDefinition } from '../tools/types.js';

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
      // Remove failed client
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
      // Ignore close errors
    }
  }
  clients.length = 0;
}
