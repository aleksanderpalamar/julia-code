import { McpTransport } from "./transport.js";
import type { McpServerConfig } from "../config/types.js";

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const PROTOCOL_VERSION = "2024-11-05";
const CLIENT_INFO = { name: "juliacode", version: "0.1.0" };

export class McpClient {
  private transport: McpTransport;
  private tools: McpToolInfo[] = [];
  private _connected = false;

  constructor(
    readonly serverName: string,
    private config: McpServerConfig,
  ) {
    this.transport = new McpTransport(config.command, config.args, config.env);
  }

  get connected(): boolean {
    return this._connected && !this.transport.closed;
  }

  getTools(): McpToolInfo[] {
    return this.tools;
  }

  async connect(): Promise<void> {
    this.transport.start();

    // Initialize handshake
    const initResult = (await this.transport.send("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO,
    })) as {
      capabilities?: unknown;
      serverInfo?: { name?: string; version?: string };
    };

    // Send initialized notification
    this.transport.notify("notifications/initialized");

    // Discover tools
    const toolsResult = (await this.transport.send("tools/list", {})) as {
      tools?: Array<{
        name: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
      }>;
    };

    this.tools = (toolsResult?.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: t.inputSchema ?? { type: "object", properties: {} },
    }));

    this._connected = true;
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ success: boolean; output: string; error?: string }> {
    if (!this.connected) {
      return {
        success: false,
        output: "",
        error: `MCP server '${this.serverName}' disconnected`,
      };
    }

    try {
      const result = (await this.transport.send("tools/call", {
        name: toolName,
        arguments: args,
      })) as {
        content?: Array<{ type: string; text?: string }>;
        isError?: boolean;
      };

      // Extract text content from MCP response
      const textParts: string[] = [];
      for (const item of result?.content ?? []) {
        if (item.type === "text" && item.text) {
          textParts.push(item.text);
        }
      }

      const output = textParts.join("\n");

      if (result?.isError) {
        return {
          success: false,
          output: "",
          error: output || "MCP tool returned error",
        };
      }

      return { success: true, output };
    } catch (err) {
      return {
        success: false,
        output: "",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  close(): void {
    this._connected = false;
    this.transport.close();
  }
}
