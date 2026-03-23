import type { SlashCommand } from "./types.js";

const commands: SlashCommand[] = [
  { name: "/clear", description: "Clear conversation history" },
  { name: "/trust", description: "Manage trusted directories" },
  { name: "/mcp", description: "Manage MCP servers" },
  { name: "/image", description: "Attach image: /image <path> | list | clear" },
  {
    name: "/mode",
    description: "Cycle mode: Normal → Plan → Accept Edits (Shift+Tab)",
  },
  { name: "/model", description: "Select Ollama model: /model [name]" },
  {
    name: "/temperament",
    description: "Set temperament: neutral | sharp | warm | auto",
  },
  { name: "/quit", description: "Exit JuliaCode" },
];

export function filterCommands(input: string): SlashCommand[] {
  if (!input.startsWith("/")) return [];
  const prefix = input.toLowerCase();
  return commands.filter((cmd) => cmd.name.startsWith(prefix));
}

export function getAllCommands(): SlashCommand[] {
  return commands;
}
