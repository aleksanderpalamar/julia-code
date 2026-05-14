export type HookEventName =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'UserPromptSubmit'
  | 'Stop'
  | 'SubagentStop'
  | 'SessionStart'
  | 'Notification'
  | 'PreCompact';

interface BasePayload {
  session_id: string;
  cwd: string;
  hook_event_name: HookEventName;
}

export interface PreToolUsePayload extends BasePayload {
  hook_event_name: 'PreToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface PostToolUsePayload extends BasePayload {
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: string;
  tool_success: boolean;
}

export interface UserPromptSubmitPayload extends BasePayload {
  hook_event_name: 'UserPromptSubmit';
  prompt: string;
}

export interface StopPayload extends BasePayload {
  hook_event_name: 'Stop';
  stop_hook_active: boolean;
}

export interface SubagentStopPayload extends BasePayload {
  hook_event_name: 'SubagentStop';
  stop_hook_active: boolean;
}

export interface SessionStartPayload extends BasePayload {
  hook_event_name: 'SessionStart';
  source: 'startup' | 'resume' | 'clear';
}

export interface NotificationPayload extends BasePayload {
  hook_event_name: 'Notification';
  message: string;
}

export interface PreCompactPayload extends BasePayload {
  hook_event_name: 'PreCompact';
  trigger: 'manual' | 'auto';
  custom_instructions: string;
}

export type HookPayload =
  | PreToolUsePayload
  | PostToolUsePayload
  | UserPromptSubmitPayload
  | StopPayload
  | SubagentStopPayload
  | SessionStartPayload
  | NotificationPayload
  | PreCompactPayload;

export interface HookOutcome {
  decision: 'block' | 'approve' | 'none';
  reason?: string;
  additionalContext?: string;
  continue: boolean;
  stopReason?: string;
}

export interface HookStdoutShape {
  continue?: boolean;
  stopReason?: string;
  decision?: 'block' | 'approve';
  reason?: string;
  hookSpecificOutput?: {
    additionalContext?: string;
  };
}
