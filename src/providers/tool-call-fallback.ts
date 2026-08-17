import { randomUUID } from 'node:crypto';
import type { ToolCall, ToolSchema } from './types.js';
import {
  validateAndCoerceArgs,
  type ToolParameterSchema,
} from '../tools/validation.js';

interface ParsedToolEnvelope {
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

export class ToolCallTextBuffer {
  private pending = '';
  private passthrough = false;

  push(text: string): string {
    if (this.passthrough) return text;
    this.pending += text;
    const firstCharacter = this.pending.trimStart()[0];
    if (!firstCharacter) return '';
    if (firstCharacter === '{' || firstCharacter === '<') return '';
    this.passthrough = true;
    const output = this.pending;
    this.pending = '';
    return output;
  }

  flush(): string {
    const output = this.pending;
    this.pending = '';
    return output;
  }

  discard(): void {
    this.pending = '';
  }
}

export function parseFallbackToolCalls(
  text: string,
  tools: readonly ToolSchema[],
): readonly ToolCall[] {
  const rawEnvelope = parseRawJsonEnvelope(text);
  if (rawEnvelope) return validateEnvelopes([rawEnvelope], tools);

  const taggedEnvelopes = parseTaggedJsonEnvelopes(text);
  const validatedTagged = validateEnvelopes(taggedEnvelopes, tools);
  if (validatedTagged.length > 0) return validatedTagged;

  return validateEnvelopes(parseXmlEnvelopes(text), tools);
}

export function hasRawToolCallShape(text: string): boolean {
  return parseRawJsonEnvelope(text) !== null;
}

function parseRawJsonEnvelope(text: string): ParsedToolEnvelope | null {
  const parsed = parseJson(text.trim());
  if (!isRecord(parsed)) return null;
  const keys = Object.keys(parsed);
  if (keys.length !== 2 || !keys.includes('name') || !keys.includes('arguments')) return null;
  if (typeof parsed.name !== 'string' || !isRecord(parsed.arguments)) return null;
  return { name: parsed.name, arguments: parsed.arguments };
}

function parseTaggedJsonEnvelopes(text: string): readonly ParsedToolEnvelope[] {
  const envelopes: ParsedToolEnvelope[] = [];
  const pattern = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const parsed = parseJson(match[1]);
    if (!isRecord(parsed) || typeof parsed.name !== 'string') continue;
    const toolArguments = parsed.arguments ?? parsed.args ?? {};
    if (!isRecord(toolArguments)) continue;
    envelopes.push({ name: parsed.name, arguments: toolArguments });
  }
  return envelopes;
}

function parseXmlEnvelopes(text: string): readonly ParsedToolEnvelope[] {
  const envelopes: ParsedToolEnvelope[] = [];
  const invokePattern = /<invoke\s+name="([^"]+)">([\s\S]*?)<\/invoke>/g;
  const parameterPattern = /<parameter\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/parameter>/g;
  let invokeMatch: RegExpExecArray | null;
  while ((invokeMatch = invokePattern.exec(text)) !== null) {
    const toolArguments: Record<string, unknown> = {};
    let parameterMatch: RegExpExecArray | null;
    parameterPattern.lastIndex = 0;
    while ((parameterMatch = parameterPattern.exec(invokeMatch[2])) !== null) {
      toolArguments[parameterMatch[1]] = parameterMatch[2].trim();
    }
    envelopes.push({ name: invokeMatch[1], arguments: toolArguments });
  }
  return envelopes;
}

function validateEnvelopes(
  envelopes: readonly ParsedToolEnvelope[],
  tools: readonly ToolSchema[],
): readonly ToolCall[] {
  const calls: ToolCall[] = [];
  for (const envelope of envelopes) {
    const tool = tools.find(candidate => candidate.function.name === envelope.name);
    if (!tool) continue;
    const validation = validateAndCoerceArgs(
      tool.function.parameters as ToolParameterSchema,
      envelope.arguments,
    );
    if (!validation.ok) continue;
    if (!hasSameArgumentKeys(envelope.arguments, validation.value)) continue;
    calls.push({
      id: randomUUID(),
      function: {
        name: envelope.name,
        arguments: validation.value,
      },
    });
  }
  return calls;
}

function hasSameArgumentKeys(
  input: Record<string, unknown>,
  validated: Record<string, unknown>,
): boolean {
  const inputKeys = Object.keys(input).sort();
  const validatedKeys = Object.keys(validated).sort();
  return inputKeys.length === validatedKeys.length
    && inputKeys.every((key, index) => key === validatedKeys[index]);
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
