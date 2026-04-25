import type { ChatMessage } from '../providers/types.js';
import { getActiveProvider } from '../providers/registry.js';
import { getSession, getMessageCount, updateSessionTitle } from '../session/manager.js';

export async function maybeGenerateTitle(
  sessionId: string,
  model: string,
  userMessage: string,
  assistantReply: string,
): Promise<string | null> {
  try {
    const session = getSession(sessionId);
    if (!session || session.title !== 'New Session') return null;

    const count = getMessageCount(sessionId);
    if (count > 4) return null;

    const provider = getActiveProvider();
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'Generate a short title (max 6 words) for this conversation. Output ONLY the title, nothing else. No quotes, no punctuation at the end.',
      },
      {
        role: 'user',
        content: `User: ${userMessage}\nAssistant: ${assistantReply.slice(0, 300)}`,
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

    title = title.trim().replace(/^["']|["']$/g, '').slice(0, 80);
    if (!title) return null;

    updateSessionTitle(sessionId, title);
    return title;
  } catch {
    return null;
  }
}
