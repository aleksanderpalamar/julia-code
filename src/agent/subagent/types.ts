export interface SubagentTask {
  id: string;
  runId: string;
  parentTurnId: string;
  parentSessionId: string;
  sessionId: string;
  task: string;
  sharedContext?: string;
  model?: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
}

export interface SubagentEvents {
  'task:queued': [taskId: string, label: string];
  'task:started': [taskId: string, label: string];
  'task:completed': [taskId: string, result: string];
  'task:failed': [taskId: string, error: string];
  'task:chunk': [taskId: string, text: string];
  'task:clear': [taskId: string];
  'task:warning': [taskId: string, message: string];
}

export interface QueuedItem {
  task: SubagentTask;
  model?: string;
}
