import { randomUUID } from 'node:crypto';
import type { ToolCall } from './types.js';

export function parseFallbackToolCalls(text: string): ToolCall[] {
  let calls = parseToolCallJson(text);
  if (calls.length > 0) return calls;

  calls = parseFunctionCallsXml(text);
  if (calls.length > 0) return calls;

  return [];
}

export function parseToolCallJson(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const regex = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.name) {
        calls.push({
          id: randomUUID(),
          function: {
            name: parsed.name,
            arguments: parsed.arguments ?? parsed.args ?? {},
          },
        });
      }
    } catch {
    }
  }

  return calls;
}

export function parseFunctionCallsXml(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const invokeRegex = /<invoke\s+name="([^"]+)">([\s\S]*?)<\/invoke>/g;
  const paramRegex = /<parameter\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/parameter>/g;

  let invokeMatch: RegExpExecArray | null;
  while ((invokeMatch = invokeRegex.exec(text)) !== null) {
    const name = invokeMatch[1];
    const body = invokeMatch[2];
    const args: Record<string, unknown> = {};

    let paramMatch: RegExpExecArray | null;
    paramRegex.lastIndex = 0;
    while ((paramMatch = paramRegex.exec(body)) !== null) {
      args[paramMatch[1]] = paramMatch[2].trim();
    }

    calls.push({
      id: randomUUID(),
      function: { name, arguments: args },
    });
  }

  return calls;
}
