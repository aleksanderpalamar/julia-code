/**
 * Focused retry-with-correction for malformed tool calls.
 *
 * When a tool call fails schema validation, this re-prompts the model with a
 * tight, self-contained message — the offending call, the exact violations and
 * the tool schema — and asks only for a corrected call. It does not hand the
 * failure back to the main loop (which would reprocess the whole context and
 * risk the model drifting off task).
 */

import type { ChatMessage, ChatChunk, ToolCall, ToolSchema } from '../../providers/types.js';
import {
  validateAndCoerceArgs,
  type ArgError,
  type ToolParameterSchema,
} from '../../tools/validation.js';

/**
 * Streams a chat completion. Injected rather than imported so the correction
 * loop is unit-testable with a fake provider — dependency inversion at the I/O
 * boundary.
 */
export type ChatStreamFn = (params: {
  model: string;
  messages: ChatMessage[];
  tools?: ToolSchema[];
}) => AsyncGenerator<ChatChunk>;

export interface CorrectionInput {
  /** The tool call that failed schema validation. */
  toolCall: ToolCall;
  /** Violations reported by the validator. */
  errors: ArgError[];
  /** Schema of the single tool being corrected. */
  toolSchema: ToolSchema;
  /** Conversation context the correction re-prompt is appended to. */
  messages: ChatMessage[];
  /** Model that performs the correction. */
  model: string;
  /** Maximum re-prompt rounds. */
  maxAttempts: number;
  chat: ChatStreamFn;
  signal?: AbortSignal;
}

export type CorrectionOutcome =
  | { kind: 'corrected'; args: Record<string, unknown> }
  | { kind: 'failed'; lastErrors: ArgError[] };

/**
 * Re-prompts the model up to `maxAttempts` times for a schema-valid version of
 * a tool call. Returns the coerced arguments on success, or the last set of
 * violations on failure.
 */
export async function attemptCorrection(input: CorrectionInput): Promise<CorrectionOutcome> {
  const { toolCall, toolSchema, messages, model, maxAttempts, chat, signal } = input;
  const toolName = toolCall.function.name;
  const params = toolSchema.function.parameters as ToolParameterSchema;
  let errors = input.errors;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) break;

    const reprompt: ChatMessage = {
      role: 'user',
      content: buildCorrectionPrompt(toolCall, errors, toolSchema),
    };
    const candidate = await firstToolCallArgs(
      chat({ model, messages: [...messages, reprompt], tools: [toolSchema] }),
      toolName,
    );
    if (!candidate) continue; // model emitted no call for this tool — retry

    const result = validateAndCoerceArgs(params, candidate);
    if (result.ok) return { kind: 'corrected', args: result.value };
    errors = result.errors;
  }

  return { kind: 'failed', lastErrors: errors };
}

/** Drains a chat stream, returning the arguments of the first call to `toolName`. */
async function firstToolCallArgs(
  stream: AsyncGenerator<ChatChunk>,
  toolName: string,
): Promise<Record<string, unknown> | null> {
  for await (const chunk of stream) {
    if (chunk.type === 'tool_call' && chunk.toolCall?.function.name === toolName) {
      return chunk.toolCall.function.arguments;
    }
  }
  return null;
}

function buildCorrectionPrompt(
  toolCall: ToolCall,
  errors: ArgError[],
  toolSchema: ToolSchema,
): string {
  const toolName = toolCall.function.name;
  const violations = errors.map(e => `  - ${e.message}`).join('\n');
  return [
    `Your previous call to the "${toolName}" tool was rejected: the arguments`,
    `did not match the tool's schema.`,
    '',
    'Validation errors:',
    violations,
    '',
    'Arguments you sent:',
    JSON.stringify(toolCall.function.arguments),
    '',
    'Tool schema:',
    JSON.stringify(toolSchema.function.parameters),
    '',
    `Re-emit ONLY a corrected call to the "${toolName}" tool. Fix exactly the`,
    'errors listed above. Do not explain.',
  ].join('\n');
}
