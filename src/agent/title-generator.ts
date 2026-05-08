import { getSession, getMessageCount, updateSessionTitle } from '../session/manager.js';
import { shouldGenerateTitle } from './title/title-policy.js';
import { generateTitleViaLLM } from './title/title-llm-call.js';
import { formatTitleFromLLM, isValidTitle } from './title/title-formatter.js';

export async function maybeGenerateTitle(
  sessionId: string,
  model: string,
  userMessage: string,
  assistantReply: string,
): Promise<string | null> {
  try {
    const session = getSession(sessionId);
    const count = getMessageCount(sessionId);
    if (!shouldGenerateTitle(session, count)) return null;

    const raw = await generateTitleViaLLM(model, userMessage, assistantReply);
    if (raw === null) return null;

    const title = formatTitleFromLLM(raw);
    if (!isValidTitle(title)) return null;

    updateSessionTitle(sessionId, title);
    return title;
  } catch {
    return null;
  }
}
