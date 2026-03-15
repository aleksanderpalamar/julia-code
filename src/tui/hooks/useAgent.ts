import { useState, useCallback, useRef, useEffect } from 'react';
import { AgentLoop } from '../../agent/loop.js';
import { AgentQueue } from '../../agent/queue.js';
import type { ChatEntry } from '../components/Chat.js';
import type { TokenUsage } from '../../providers/types.js';

export function useAgent(onSessionChanged?: () => void) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [sessionTokens, setSessionTokens] = useState({ promptTokens: 0, completionTokens: 0 });
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

    const onToolCall = (tc: { function: { name: string } }) => {
      // Flush streaming text as assistant entry
      setStreamingText(prev => {
        if (prev.trim()) {
          setEntries(e => [...e, { type: 'assistant', content: prev }]);
        }
        return '';
      });

      setEntries(e => [
        ...e,
        { type: 'tool_call', content: '', toolName: tc.function.name },
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

    agent.on('thinking', onThinking);
    agent.on('chunk', onChunk);
    agent.on('tool_call', onToolCall);
    agent.on('tool_result', onToolResult);
    agent.on('compacting', onCompacting);
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
      agent.off('usage', onUsage);
      agent.off('title', onTitle);
      agent.off('done', onDone);
      agent.off('error', onError);
    };
  }, [agent]);

  const sendMessage = useCallback(
    (sessionId: string, message: string, model?: string) => {
      setEntries(e => [...e, { type: 'user', content: message }]);
      queueRef.current!.enqueue(sessionId, message, model);
    },
    []
  );

  const addSystemEntry = useCallback(
    (content: string) => {
      setEntries(e => [...e, { type: 'system', content }]);
    },
    []
  );

  return { entries, streamingText, isThinking, sessionTokens, sendMessage, addSystemEntry };
}
