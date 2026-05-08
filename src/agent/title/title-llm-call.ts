import type { ChatMessage } from '../../providers/types.js';
import { getProvider } from '../../providers/registry.js';

const SYSTEM_PROMPT =
  'Generate a short title (max 6 words) for this conversation. Output ONLY the title, nothing else. No quotes, no punctuation at the end.';

const MAX_REPLY_PREVIEW = 300;

export async function generateTitleViaLLM(
  model: string,
  userMessage: string,
  assistantReply: string,
): Promise<string | null> {
  const provider = getProvider('ollama');
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `User: ${userMessage}\nAssistant: ${assistantReply.slice(0, MAX_REPLY_PREVIEW)}`,
    },
  ];

  let title = '';
  const stream = provider.chat({ model, messages });
  for await (const chunk of stream) {
    if (chunk.type === 'error') return null;
    if (chunk.type === 'text' && chunk.text) {
      title += chunk.text;
    }
  }
  return title;
}
