import type { ToolDefinition } from './types.js';
import { listSessions, getMessages, getMessageCount } from '../session/manager.js';

export const sessionsTool: ToolDefinition = {
  name: 'sessions',
  description: 'Manage your own saved sessions. Actions: "list" returns all sessions, "messages" returns messages from a session, "count" returns message count.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'messages', 'count'],
        description: 'Action to perform',
      },
      session_id: {
        type: 'string',
        description: 'Session ID (required for "messages" and "count")',
      },
      after_id: {
        type: 'number',
        description: 'Only return messages after this message ID (for pagination)',
      },
    },
    required: ['action'],
  },

  async execute(args, _context?) {
    const action = args.action as string;

    switch (action) {
      case 'list': {
        const sessions = listSessions();
        if (sessions.length === 0) {
          return { success: true, output: 'No sessions found.' };
        }
        const lines = sessions.map(s =>
          `${s.id} | ${s.title} | ${s.model} | created: ${s.created_at} | updated: ${s.updated_at}`
        );
        return { success: true, output: `${sessions.length} sessions:\n${lines.join('\n')}` };
      }

      case 'messages': {
        const sessionId = args.session_id as string;
        if (!sessionId) {
          return { success: false, output: '', error: 'session_id is required for "messages" action' };
        }
        const afterId = args.after_id as number | undefined;
        const messages = getMessages(sessionId, afterId);
        if (messages.length === 0) {
          return { success: true, output: 'No messages found.' };
        }
        const lines = messages.map(m => {
          const preview = m.content.length > 200 ? m.content.slice(0, 200) + '...' : m.content;
          return `[${m.id}] ${m.role}: ${preview}`;
        });
        return { success: true, output: `${messages.length} messages:\n${lines.join('\n')}` };
      }

      case 'count': {
        const sessionId = args.session_id as string;
        if (!sessionId) {
          return { success: false, output: '', error: 'session_id is required for "count" action' };
        }
        const count = getMessageCount(sessionId);
        return { success: true, output: `${count} messages in session ${sessionId}` };
      }

      default:
        return { success: false, output: '', error: `Unknown action: ${action}. Use "list", "messages", or "count".` };
    }
  },
};
