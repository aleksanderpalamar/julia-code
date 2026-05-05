import type { SlashCommand } from "./types.js";
import {
  getMcpServerConfigs,
  addMcpServerConfig,
  removeMcpServerConfig,
} from "../../../config/mcp.js";
import {
  getMcpServerStatuses,
  addMcpServer,
  removeMcpServer,
} from "../../../mcp/manager.js";

export const mcp: SlashCommand = {
  match: (t) => t === "/mcp" || t.startsWith("/mcp"),
  handle: (text, ctx) => {
    if (text === "/mcp" || text === "/mcp list") {
      const configs = getMcpServerConfigs();
      const statuses = getMcpServerStatuses();
      const configNames = Object.keys(configs);

      if (configNames.length === 0) {
        ctx.addSystemEntry("No MCP servers configured.");
        return true;
      }

      const lines = configNames.map((name) => {
        const status = statuses.find((s) => s.name === name);
        const state = status?.connected
          ? `connected, ${status.toolCount} tools`
          : "disconnected";
        return `  - ${name}: ${state}`;
      });
      ctx.addSystemEntry("MCP Servers:\n" + lines.join("\n"));
      return true;
    }

    if (text.startsWith("/mcp add ")) {
      const parts = text.slice("/mcp add ".length).trim().split(/\s+/);
      if (parts.length < 2) {
        ctx.addSystemEntry("Usage: /mcp add <name> <command> [args...]");
        return true;
      }
      const [name, command, ...args] = parts;
      const config = { command, args };
      addMcpServerConfig(name, config);
      ctx.addSystemEntry(`Adding MCP server '${name}'...`);
      addMcpServer(name, config).then((result) => {
        if (result.success) {
          ctx.addSystemEntry(
            `MCP server '${name}' connected: ${result.toolCount} tools registered.`,
          );
        } else {
          ctx.addSystemEntry(
            `MCP server '${name}' failed to connect: ${result.error}`,
          );
        }
      });
      return true;
    }

    if (text.startsWith("/mcp remove ")) {
      const name = text.slice("/mcp remove ".length).trim();
      if (!name) {
        ctx.addSystemEntry("Usage: /mcp remove <name>");
        return true;
      }
      removeMcpServer(name);
      removeMcpServerConfig(name);
      ctx.addSystemEntry(`MCP server '${name}' removed.`);
      return true;
    }

    ctx.addSystemEntry(
      "Usage:\n  /mcp             — list servers\n  /mcp add <name> <command> [args...]  — add server\n  /mcp remove <name>  — remove server",
    );
    return true;
  },
};
