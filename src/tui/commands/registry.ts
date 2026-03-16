import type { SlashCommand } from './types.js';

const commands: SlashCommand[] = [
  { name: '/clear', description: 'Clear conversation history' },
  { name: '/trust', description: 'Manage trusted directories' },
  { name: '/mcp', description: 'Manage MCP servers' },
  { name: '/quit', description: 'Exit JuliaAgent' },
];

export function filterCommands(input: string): SlashCommand[] {
  if (!input.startsWith('/')) return [];
  const prefix = input.toLowerCase();
  return commands.filter(cmd => cmd.name.startsWith(prefix));
}

export function getAllCommands(): SlashCommand[] {
  return commands;
}
