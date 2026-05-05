import { useState, useCallback, useRef, useEffect } from 'react';
import { AgentLoop } from '../../agent/loop.js';
import type { AgentEvents, OrchestrationProgress } from '../../agent/loop.js';
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
  const [activeToolModel, setActiveToolModel] = useState<string | null>(null);
  const [orchestrationProgress, setOrchestrationProgress] = useState<OrchestrationProgress | null>(null);
  const queueRef = useRef<AgentQueue | null>(null);
  const onSessionChangedRef = useRef(onSessionChanged);
  onSessionChangedRef.current = onSessionChanged;

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
      setOrchestrationProgress(null);
      setStreamingText(prev => {
        if (prev.trim()) {
          setEntries(e => [...e, { type: 'assistant', content: prev }]);
        }
        return '';
      });
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

    const onModelSwitch = (model: string) => {
      setActiveToolModel(model);
    };

    const onClearStreaming = () => {
      setStreamingText('');
      setEntries(e => {
        const last = e[e.length - 1];
        if (last?.type === 'assistant') return e.slice(0, -1);
        return e;
      });
    };

    const onOrchestrationProgress = (progress: OrchestrationProgress) => {
      setOrchestrationProgress(progress);
    };

    const onSubagentChunk = (taskId: string, label: string, text: string) => {
      setEntries(e => {
        const existingIdx = e.findIndex(
          entry => entry.type === 'subagent_stream' && entry.toolName === taskId
        );
        if (existingIdx >= 0) {
          const updated = [...e];
          updated[existingIdx] = {
            ...updated[existingIdx],
            content: updated[existingIdx].content + text,
          };
          return updated;
        }
        return [...e, { type: 'subagent_stream', content: text, subagentLabel: label, toolName: taskId }];
      });
    };

    const onSubagentStatus = (taskId: string, label: string, status: string, durationMs?: number) => {
      const dur = durationMs !== undefined ? ` (${(durationMs / 1000).toFixed(1)}s)` : '';
      const icon = status === 'completed' ? '✓' : status === 'failed' ? '✗' : '▸';
      setEntries(e => [...e, {
        type: 'system',
        content: `${icon} [${label}] ${status}${dur}`,
      }]);
    };

    const handlers: Partial<{
      [K in keyof AgentEvents]: (...args: AgentEvents[K]) => void;
    }> = {
      thinking: onThinking,
      chunk: onChunk,
      tool_call: onToolCall,
      tool_result: onToolResult,
      compacting: onCompacting,
      approval_needed: onApprovalNeeded,
      usage: onUsage,
      title: onTitle,
      model_switch: onModelSwitch,
      clear_streaming: onClearStreaming,
      orchestration_progress: onOrchestrationProgress,
      subagent_chunk: onSubagentChunk,
      subagent_status: onSubagentStatus,
      done: onDone,
      error: onError,
    };

    const entries = Object.entries(handlers) as [
      keyof AgentEvents,
      (...args: any[]) => void,
    ][];

    for (const [event, handler] of entries) {
      agent.on(event, handler as never);
    }

    return () => {
      for (const [event, handler] of entries) {
        agent.off(event, handler as never);
      }
    };
  }, [agent]);

  const sendMessage = useCallback(
    (sessionId: string, message: string, model?: string, mode?: AgentMode, images?: string[], temperament?: Temperament, skillContent?: string) => {
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
      queueRef.current!.enqueue(sessionId, message, model, images, skillContent);
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

  return { entries, streamingText, isThinking, sessionTokens, activeToolModel, orchestrationProgress, sendMessage, addSystemEntry, sendBtw, pendingApproval, resolveApproval };
}
