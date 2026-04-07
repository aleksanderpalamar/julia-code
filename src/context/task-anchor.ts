import { getMessages } from '../session/manager.js';

export function extractTaskAnchor(sessionId: string): string | null {
  const messages = getMessages(sessionId);
  const firstUserMsg = messages.find(m => m.role === 'user');
  if (!firstUserMsg) return null;

  const text = firstUserMsg.content.trim();
  if (!text) return null;

  if (text.length <= 500) return text;

  const sentences = text.match(/[^.!?\n]+[.!?\n]?/g);
  if (sentences && sentences.length >= 2) {
    return sentences.slice(0, 2).join('').trim();
  }

  return text.slice(0, 500) + '...';
}

export function formatTaskAnchor(anchor: string): string {
  return [
    '## Tarefa Atual',
    `Seu objetivo principal nesta sessão: ${anchor}`,
    '',
    'Mantenha foco neste objetivo. Não desvie para trabalho não relacionado.',
    'Antes de cada ação, verifique se ela contribui diretamente para este objetivo.',
  ].join('\n');
}
