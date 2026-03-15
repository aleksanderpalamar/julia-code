import type { ToolSchema } from '../providers/types.js';

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}

export function toolToSchema(tool: ToolDefinition): ToolSchema {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}
