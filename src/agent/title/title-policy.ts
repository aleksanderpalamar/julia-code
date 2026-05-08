import type { Session } from '../../session/manager.js';

const MAX_MESSAGES_FOR_GENERATION = 4;
const PLACEHOLDER_TITLE = 'New Session';

export function shouldGenerateTitle(
  session: Session | null | undefined,
  messageCount: number,
): boolean {
  if (!session) return false;
  if (session.title !== PLACEHOLDER_TITLE) return false;
  if (messageCount > MAX_MESSAGES_FOR_GENERATION) return false;
  return true;
}
