import type { ChatMessage } from '../providers/types.js';
import { getMessages, getLatestCompaction, getRecentMemories, type Message } from '../session/manager.js';
import { loadSkills } from '../skills/loader.js';
import { getConfig } from '../config/index.js';
import { getProjectDir, getWorkspace } from '../config/workspace.js';
import { join } from 'node:path';
import { homedir } from 'node:os';

export function buildContext(sessionId: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const config = getConfig();

  // System prompt from skills + environment info
  const skills = loadSkills();
  const juliaHome = join(homedir(), '.juliacode');
  const envInfo = [
    `## Environment`,
    `- Project directory: ${getProjectDir()}`,
    `- Julia internal directory: ${juliaHome}`,
    ``,
    `IMPORTANT: Your project context is ONLY the project directory above.`,
    `The ${juliaHome}/ directory contains your internal data (database, config, workspace) — it is NOT part of the user's project.`,
    `When the user asks about "this directory" or "this project", they mean the project directory, not your internal files.`,
    `Do NOT include or mention ${juliaHome}/ files when describing the user's project.`,
  ].join('\n');
  // Load persistent memories
  const memories = getRecentMemories(15);
  let memoriesSection = '';
  if (memories.length > 0) {
    const memoryLines = memories.map(m => `- [${m.category}] **${m.key}**: ${m.content}`);
    memoriesSection = [
      `## Your Memories`,
      `These are facts you saved from previous sessions:`,
      ...memoryLines,
      ``,
      `Use the \`memory\` tool to save new memories or search for more.`,
    ].join('\n');
  }

  const systemContent = skills.map(s => s.content).join('\n\n---\n\n') + '\n\n---\n\n' + envInfo
    + (memoriesSection ? '\n\n---\n\n' + memoriesSection : '');
  if (systemContent) {
    messages.push({ role: 'system', content: systemContent });
  }

  // Check for existing compaction
  const compaction = getLatestCompaction(sessionId);

  if (compaction) {
    // Inject compaction summary as a system message
    messages.push({
      role: 'system',
      content: `[Conversation summary up to this point]\n${compaction.summary}`,
    });

    // Only load messages after the compaction boundary
    const recentMessages = getMessages(sessionId, compaction.messages_end);
    for (const msg of recentMessages) {
      messages.push(dbMessageToChatMessage(msg));
    }
  } else {
    // No compaction — load all messages
    const dbMessages = getMessages(sessionId);
    for (const msg of dbMessages) {
      messages.push(dbMessageToChatMessage(msg));
    }
  }

  return messages;
}

/**
 * Check if the context needs compaction based on token estimate.
 * Returns the messages that should be summarized, or null if no compaction needed.
 */
export function getCompactableMessages(sessionId: string): { messages: Message[]; lastId: number } | null {
  const config = getConfig();
  const compaction = getLatestCompaction(sessionId);

  const allMessages = compaction
    ? getMessages(sessionId, compaction.messages_end)
    : getMessages(sessionId);

  if (allMessages.length <= config.compactionKeepRecent) {
    return null;
  }

  // Estimate tokens for all messages
  const totalTokens = estimateTokensFromDb(allMessages);
  if (totalTokens < config.compactionThreshold) {
    return null;
  }

  // Messages to compact: everything except the most recent N
  const cutoff = allMessages.length - config.compactionKeepRecent;
  const toCompact = allMessages.slice(0, cutoff);

  if (toCompact.length === 0) return null;

  return {
    messages: toCompact,
    lastId: toCompact[toCompact.length - 1].id,
  };
}

function dbMessageToChatMessage(msg: Message): ChatMessage {
  const chatMsg: ChatMessage = {
    role: msg.role,
    content: msg.content,
  };

  if (msg.tool_calls) {
    try {
      chatMsg.tool_calls = JSON.parse(msg.tool_calls);
    } catch {
      // ignore malformed tool_calls
    }
  }

  if (msg.tool_call_id) {
    chatMsg.tool_call_id = msg.tool_call_id;
  }

  return chatMsg;
}

/**
 * Rough token estimate: chars / 4
 */
export function estimateTokens(messages: ChatMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    chars += m.content.length;
    if (m.tool_calls) {
      chars += JSON.stringify(m.tool_calls).length;
    }
  }
  return Math.ceil(chars / 4);
}

function estimateTokensFromDb(messages: Message[]): number {
  let chars = 0;
  for (const m of messages) {
    chars += m.content.length;
    if (m.tool_calls) chars += m.tool_calls.length;
  }
  return Math.ceil(chars / 4);
}
