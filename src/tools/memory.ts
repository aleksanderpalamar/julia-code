import type { ToolDefinition } from './types.js';
import { saveMemory, getMemory, searchMemories, listMemories, deleteMemory } from '../session/manager.js';

let currentSessionId: string | undefined;

export function setCurrentSessionId(id: string): void {
  currentSessionId = id;
}

export const memoryTool: ToolDefinition = {
  name: 'memory',
  description: 'Manage your long-term memories that persist across sessions. Actions: "save" stores a memory (upsert by key), "recall" searches memories by query, "list" lists all memories, "delete" removes a memory by key.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['save', 'recall', 'list', 'delete'],
        description: 'Action to perform',
      },
      key: {
        type: 'string',
        description: 'Short kebab-case identifier for the memory (required for save/delete)',
      },
      content: {
        type: 'string',
        description: 'The memory content to save (required for save)',
      },
      category: {
        type: 'string',
        enum: ['user', 'project', 'pattern', 'general'],
        description: 'Memory category (optional, default: general)',
      },
      query: {
        type: 'string',
        description: 'Search query (required for recall)',
      },
    },
    required: ['action'],
  },

  async execute(args, _context?) {
    const action = args.action as string;

    switch (action) {
      case 'save': {
        const key = args.key as string;
        const content = args.content as string;
        if (!key || !content) {
          return { success: false, output: '', error: '"key" and "content" are required for save action' };
        }
        const category = (args.category as string) || 'general';
        const memory = saveMemory(key, content, category, currentSessionId);
        return { success: true, output: `Memory saved: [${memory.category}] ${memory.key}` };
      }

      case 'recall': {
        const query = args.query as string;
        if (!query) {
          return { success: false, output: '', error: '"query" is required for recall action' };
        }
        const category = args.category as string | undefined;
        const memories = searchMemories(query, category);
        if (memories.length === 0) {
          return { success: true, output: 'No memories found matching that query.' };
        }
        const lines = memories.map(m =>
          `[${m.category}] **${m.key}**: ${m.content} (updated: ${m.updated_at})`
        );
        return { success: true, output: `${memories.length} memories found:\n${lines.join('\n')}` };
      }

      case 'list': {
        const category = args.category as string | undefined;
        const memories = listMemories(category);
        if (memories.length === 0) {
          return { success: true, output: 'No memories stored yet.' };
        }
        const lines = memories.map(m =>
          `[${m.category}] **${m.key}**: ${m.content}`
        );
        return { success: true, output: `${memories.length} memories:\n${lines.join('\n')}` };
      }

      case 'delete': {
        const key = args.key as string;
        if (!key) {
          return { success: false, output: '', error: '"key" is required for delete action' };
        }
        const deleted = deleteMemory(key);
        return deleted
          ? { success: true, output: `Memory "${key}" deleted.` }
          : { success: false, output: '', error: `Memory "${key}" not found.` };
      }

      default:
        return { success: false, output: '', error: `Unknown action: ${action}. Use "save", "recall", "list", or "delete".` };
    }
  },
};
