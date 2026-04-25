import type { ChatMessage } from '../../providers/types.js';
import { getActiveProvider } from '../../providers/registry.js';
import { addSessionTokens } from '../../session/manager.js';
import type { OrchestrationEventSink } from './types.js';

const SYNTHESIS_SYSTEM_PROMPT =
  'You are a helpful assistant. The user gave a task that was split into subtasks and executed in parallel by subagents. Some subtasks failed. Briefly explain what succeeded and what went wrong, and suggest how to fix the failures. Be concise and direct. Respond in the same language the user used.';

export interface SynthesisDeps {
  sessionId: string;
  userMessage: string;
  model: string;
  resultLines: string[];
  emit: Pick<OrchestrationEventSink, 'chunk' | 'usage'>;
}

export async function synthesizeFailureReport(deps: SynthesisDeps): Promise<string> {
  const { sessionId, userMessage, model, resultLines, emit } = deps;

  const messages: ChatMessage[] = [
    { role: 'system', content: SYNTHESIS_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Original request: "${userMessage}"\n\nSubagent results:\n\n${resultLines.filter(Boolean).join('\n\n---\n\n')}`,
    },
  ];

  let text = '';

  try {
    const stream = getActiveProvider().chat({ model, messages });

    for await (const chunk of stream) {
      if (chunk.type === 'text' && chunk.text) {
        text += chunk.text;
        emit.chunk(chunk.text);
      } else if (chunk.type === 'done' && chunk.usage) {
        addSessionTokens(sessionId, chunk.usage.promptTokens + chunk.usage.completionTokens);
        emit.usage(chunk.usage);
      } else if (chunk.type === 'error') {
        process.stderr.write(`[orchestrator] synthesis provider error: ${chunk.error}\n`);
        break;
      }
    }
  } catch (err) {
    process.stderr.write(`[orchestrator] synthesis threw: ${err instanceof Error ? err.message : String(err)}\n`);
  }

  return text;
}
