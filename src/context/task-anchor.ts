import { getMessages } from '../session/manager.js';

/**
 * Extract the user's original task/goal from the first user message in the session.
 */
export function extractTaskAnchor(sessionId: string): string | null {
  const messages = getMessages(sessionId);
  const firstUserMsg = messages.find(m => m.role === 'user');
  if (!firstUserMsg) return null;

  const text = firstUserMsg.content.trim();
  if (!text) return null;

  // If short enough, use as-is
  if (text.length <= 500) return text;

  // Extract first 2 sentences + trim
  const sentences = text.match(/[^.!?\n]+[.!?\n]?/g);
  if (sentences && sentences.length >= 2) {
    return sentences.slice(0, 2).join('').trim();
  }

  // Fallback: first 500 chars
  return text.slice(0, 500) + '...';
}

/**
 * Format the task anchor as a system prompt section.
 */
export function formatTaskAnchor(anchor: string): string {
  return [
    '## Tarefa Atual',
    `Seu objetivo principal nesta sessão: ${anchor}`,
    '',
    'Mantenha foco neste objetivo. Não desvie para trabalho não relacionado.',
    'Antes de cada ação, verifique se ela contribui diretamente para este objetivo.',
  ].join('\n');
}
