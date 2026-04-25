import type { ChatMessage } from '../providers/types.js';
import type { Message } from '../session/manager.js';
import { getActiveProvider } from '../providers/registry.js';
import { estimateTokens } from './token-counter.js';

export interface StructuredCompaction {
  taskGoal: string;
  filesRead: string[];
  filesModified: string[];
  decisions: string[];
  currentState: string;
  pendingWork: string;
  keyFacts: string[];
  rawSummary: string;
}

const STRUCTURED_COMPACTION_PROMPT = `You are a context compressor for an AI coding assistant. Extract structured information from the conversation below into a JSON object with EXACTLY these fields:

{
  "taskGoal": "The user's original task or goal",
  "filesRead": ["list of file paths that were read"],
  "filesModified": ["list of file paths that were written or edited"],
  "decisions": ["key decisions made and their rationale"],
  "currentState": "what has been accomplished so far",
  "pendingWork": "what still needs to be done",
  "keyFacts": ["important facts discovered: API endpoints, config values, patterns, etc."],
  "rawSummary": "free-form summary of anything not captured above"
}

CRITICAL RULES:
- Extract ALL file paths from tool calls and results — do not miss any
- Preserve ALL decisions and their rationale
- Identify the user's original goal from the first user message
- Be specific about what was completed and what remains
- Output ONLY valid JSON, no markdown, no preamble`;

const MERGE_COMPACTION_PROMPT = `You are a context compressor. Merge the following new conversation messages into the existing structured summary. Update all fields as needed — add new files, decisions, facts. Update currentState and pendingWork. Output ONLY valid JSON with the same structure.

Existing summary:`;

export async function performStructuredCompaction(
  messages: Message[],
  existingCompaction: StructuredCompaction | null,
  model: string,
  maxOutputTokens?: number,
): Promise<StructuredCompaction> {
  const provider = getActiveProvider();

  const summaryMessages: ChatMessage[] = [];

  if (existingCompaction) {
    summaryMessages.push({
      role: 'system',
      content: MERGE_COMPACTION_PROMPT,
    });
    summaryMessages.push({
      role: 'user',
      content: JSON.stringify(existingCompaction, null, 2) + '\n\nNew messages to incorporate:',
    });
  } else {
    summaryMessages.push({
      role: 'system',
      content: STRUCTURED_COMPACTION_PROMPT,
    });
  }

  let conversationText = '';
  for (const msg of messages) {
    const prefix = msg.role.toUpperCase();
    conversationText += `[${prefix}]: ${msg.content}\n`;
    if (msg.tool_calls) {
      conversationText += `[TOOL_CALLS]: ${msg.tool_calls}\n`;
    }
  }

  if (maxOutputTokens) {
    const maxInputChars = maxOutputTokens * 7;     if (conversationText.length > maxInputChars) {
      conversationText = conversationText.slice(0, maxInputChars) + '\n... [truncated for compaction]';
    }
  }

  summaryMessages.push({ role: 'user', content: conversationText });

  let response = '';
  const stream = provider.chat({ model, messages: summaryMessages });
  for await (const chunk of stream) {
    if (chunk.type === 'error') break;
    if (chunk.type === 'text' && chunk.text) {
      response += chunk.text;
    }
  }

  return parseCompactionResponse(response, existingCompaction);
}

function parseCompactionResponse(
  response: string,
  existing: StructuredCompaction | null,
): StructuredCompaction {
  const trimmed = response.trim();

  const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, trimmed];
  const jsonStr = (jsonMatch[1] ?? trimmed).trim();

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      taskGoal: parsed.taskGoal ?? existing?.taskGoal ?? '',
      filesRead: Array.isArray(parsed.filesRead) ? parsed.filesRead : existing?.filesRead ?? [],
      filesModified: Array.isArray(parsed.filesModified) ? parsed.filesModified : existing?.filesModified ?? [],
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : existing?.decisions ?? [],
      currentState: parsed.currentState ?? existing?.currentState ?? '',
      pendingWork: parsed.pendingWork ?? existing?.pendingWork ?? '',
      keyFacts: Array.isArray(parsed.keyFacts) ? parsed.keyFacts : existing?.keyFacts ?? [],
      rawSummary: parsed.rawSummary ?? '',
    };
  } catch {
    return {
      taskGoal: existing?.taskGoal ?? '',
      filesRead: existing?.filesRead ?? [],
      filesModified: existing?.filesModified ?? [],
      decisions: existing?.decisions ?? [],
      currentState: existing?.currentState ?? '',
      pendingWork: existing?.pendingWork ?? '',
      keyFacts: existing?.keyFacts ?? [],
      rawSummary: trimmed,
    };
  }
}

export function formatCompactionForContext(compaction: StructuredCompaction, budgetTokens: number): string {
  const sections: string[] = [];

  if (compaction.taskGoal) {
    sections.push(`**Objetivo:** ${compaction.taskGoal}`);
  }

  if (compaction.filesModified.length > 0) {
    sections.push(`**Arquivos modificados:** ${compaction.filesModified.join(', ')}`);
  }

  if (compaction.decisions.length > 0) {
    sections.push(`**Decisões:**\n${compaction.decisions.map(d => `- ${d}`).join('\n')}`);
  }

  if (compaction.currentState) {
    sections.push(`**Estado atual:** ${compaction.currentState}`);
  }

  if (compaction.pendingWork) {
    sections.push(`**Trabalho pendente:** ${compaction.pendingWork}`);
  }

  if (compaction.filesRead.length > 0) {
    sections.push(`**Arquivos lidos:** ${compaction.filesRead.join(', ')}`);
  }

  if (compaction.keyFacts.length > 0) {
    sections.push(`**Fatos importantes:**\n${compaction.keyFacts.map(f => `- ${f}`).join('\n')}`);
  }

  if (compaction.rawSummary) {
    sections.push(`**Resumo:** ${compaction.rawSummary}`);
  }

  let result = '';
  for (const section of sections) {
    const candidate = result ? result + '\n\n' + section : section;
    if (estimateTokens(candidate) > budgetTokens) break;
    result = candidate;
  }

  return result || compaction.rawSummary.slice(0, budgetTokens * 3); }

export function serializeCompaction(compaction: StructuredCompaction): string {
  return JSON.stringify(compaction);
}

export function deserializeCompaction(summary: string, format?: string): StructuredCompaction {
  if (format === 'structured') {
    try {
      return JSON.parse(summary) as StructuredCompaction;
    } catch {
    }
  }

  return {
    taskGoal: '',
    filesRead: [],
    filesModified: [],
    decisions: [],
    currentState: '',
    pendingWork: '',
    keyFacts: [],
    rawSummary: summary,
  };
}
