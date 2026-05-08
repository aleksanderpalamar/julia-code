import type { ToolCall, TokenUsage } from '../../providers/types.js';
import type { ContextHealth } from '../../context/health.js';
import type { ApprovalResult } from '../../tui/components/ApprovalPrompt.js';
import type { OrchestrationProgress } from '../orchestrator/index.js';

export type { OrchestrationProgress };

export interface AgentEvents {
  thinking: [];
  chunk: [text: string];
  tool_call: [toolCall: ToolCall];
  tool_result: [name: string, result: string, success: boolean];
  approval_needed: [toolName: string, args: Record<string, unknown>, respond: (result: ApprovalResult) => void];
  compacting: [];
  context_health: [health: ContextHealth];
  usage: [usage: TokenUsage];
  title: [title: string];
  model_switch: [model: string];
  clear_streaming: [];
  orchestration_progress: [progress: OrchestrationProgress];
  subagent_chunk: [taskId: string, label: string, text: string];
  subagent_status: [taskId: string, label: string, status: string, durationMs?: number];
  done: [fullText: string];
  error: [error: string];
}
