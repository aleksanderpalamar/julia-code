import { useState, useCallback, useRef, useEffect } from 'react';
import { AgentLoop } from '../../agent/loop.js';
import { AgentQueue } from '../../agent/queue.js';
import { addMessage } from '../../session/manager.js';
import type { ChatEntry } from '../components/Chat.js';
import type { TokenUsage } from '../../providers/types.js';
import type { AgentMode, Temperament } from '../types.js';
import { WRITE_TOOLS } from '../types.js';
import type { ApprovalResult } from '../components/ApprovalPrompt.js';

export interface PendingApproval {
  toolName: string;
  args: Record<string, unknown>;
  respond: (result: ApprovalResult) => void;
}

export function useAgent(onSessionChanged?: () => void) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [sessionTokens, setSessionTokens] = useState({ promptTokens: 0, completionTokens: 0 });
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const queueRef = useRef<AgentQueue | null>(null);
  const onSessionChangedRef = useRef(onSessionChanged);
  onSessionChangedRef.current = onSessionChanged;

  // Initialize agent once
  if (!queueRef.current) {
    const agent = new AgentLoop();
    queueRef.current = new AgentQueue(agent);
  }

  const agent = queueRef.current.getAgent();

  useEffect(() => {
    const onThinking = () => {
      setIsThinking(true);
      setStreamingText('');
    };

    const onCompacting = () => {
      setEntries(e => [...e, { type: 'tool_call', content: '', toolName: 'compacting context...' }]);
    };

    const onChunk = (text: string) => {
      setIsThinking(false);
      setStreamingText(prev => prev + text);
    };

    const onToolCall = (tc: { function: { name: string; arguments: Record<string, unknown> } }) => {
      // Flush streaming text as assistant entry
      setStreamingText(prev => {
        if (prev.trim()) {
          setEntries(e => [...e, { type: 'assistant', content: prev }]);
        }
        return '';
      });

      setEntries(e => [
        ...e,
        { type: 'tool_call', content: '', toolName: tc.function.name, toolArgs: tc.function.arguments },
      ]);
    };

    const onToolResult = (name: string, result: string, success: boolean) => {
      setEntries(e => [
        ...e,
        { type: 'tool_result', content: result, toolName: name, toolSuccess: success },
      ]);
    };

    const onDone = (fullText: string) => {
      setIsThinking(false);
      setStreamingText(prev => {
        if (prev.trim()) {
          setEntries(e => [...e, { type: 'assistant', content: prev }]);
        }
        return '';
      });
      // If fullText wasn't already streamed (e.g., after tool calls)
      // The streaming chunks already added it, so only add if nothing was streamed
    };

    const onUsage = (usage: TokenUsage) => {
      setSessionTokens(prev => ({
        promptTokens: prev.promptTokens + usage.promptTokens,
        completionTokens: prev.completionTokens + usage.completionTokens,
      }));
      onSessionChangedRef.current?.();
    };

    const onTitle = () => {
      onSessionChangedRef.current?.();
    };

    const onError = (error: string) => {
      setIsThinking(false);
      setStreamingText('');
      setEntries(e => [...e, { type: 'error', content: error }]);
    };

    const onApprovalNeeded = (toolName: string, args: Record<string, unknown>, respond: (result: ApprovalResult) => void) => {
      setPendingApproval({ toolName, args, respond });
    };

    agent.on('thinking', onThinking);
    agent.on('chunk', onChunk);
    agent.on('tool_call', onToolCall);
    agent.on('tool_result', onToolResult);
    agent.on('compacting', onCompacting);
    agent.on('approval_needed', onApprovalNeeded);
    agent.on('usage', onUsage);
    agent.on('title', onTitle);
    agent.on('done', onDone);
    agent.on('error', onError);

    return () => {
      agent.off('thinking', onThinking);
      agent.off('chunk', onChunk);
      agent.off('tool_call', onToolCall);
      agent.off('tool_result', onToolResult);
      agent.off('compacting', onCompacting);
      agent.off('approval_needed', onApprovalNeeded);
      agent.off('usage', onUsage);
      agent.off('title', onTitle);
      agent.off('done', onDone);
      agent.off('error', onError);
    };
  }, [agent]);

  const sendMessage = useCallback(
    (sessionId: string, message: string, model?: string, mode?: AgentMode, images?: string[], temperament?: Temperament) => {
      const agent = queueRef.current!.getAgent();
      if (mode === 'plan') {
        agent.setExcludeTools(WRITE_TOOLS);
        agent.setPlanMode(true);
      } else {
        agent.setExcludeTools([]);
        agent.setPlanMode(false);
      }
      agent.setTemperament(temperament ?? 'neutral');
      const imageCount = images?.length ?? 0;
      const userContent = imageCount > 0
        ? `${Array.from({ length: imageCount }, (_, i) => `[Image #${i + 1}]`).join(' ')} ${message}`
        : message;
      setEntries(e => [...e, { type: 'user', content: userContent }]);
      queueRef.current!.enqueue(sessionId, message, model, images);
    },
    []
  );

  const addSystemEntry = useCallback(
    (content: string) => {
      setEntries(e => [...e, { type: 'system', content }]);
    },
    []
  );

  const sendBtw = useCallback(
    (sessionId: string, message: string) => {
      addMessage(sessionId, 'user', `[btw] ${message}`);
      setEntries(e => [...e, { type: 'btw', content: message }]);
    },
    []
  );

  const resolveApproval = useCallback((result: ApprovalResult) => {
    if (pendingApproval) {
      pendingApproval.respond(result);
      setPendingApproval(null);
    }
  }, [pendingApproval]);

  return { entries, streamingText, isThinking, sessionTokens, sendMessage, addSystemEntry, sendBtw, pendingApproval, resolveApproval };
}
