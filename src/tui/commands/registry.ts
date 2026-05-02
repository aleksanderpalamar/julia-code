import type { SlashCommand } from "./types.js";
import { loadSkills, loadUserSkills } from "../../skills/loader.js";

const commands: SlashCommand[] = [
  { name: "/clear", description: "Clear conversation history" },
  { name: "/trust", description: "Manage trusted directories" },
  { name: "/mcp", description: "Manage MCP servers" },
  { name: "/image", description: "Attach image: /image <path> | list | clear" },
  {
    name: "/mode",
    description: "Cycle mode: Normal → Plan → Accept Edits (Shift+Tab)",
  },
  { name: "/model", description: "Select Ollama model: /model [name]", autoTrigger: true },
  {
    name: "/toolmodel",
    description: "Select tool model: /toolmodel [name|auto]",
    autoTrigger: true,
  },
  {
    name: "/temperament",
    description: "Set temperament: neutral | sharp | warm | auto",
  },
  {
    name: "/stats",
    description: "Show orchestration and planner stats from events.jsonl",
  },
  { name: "/quit", description: "Exit JuliaCode" },
];

export function getInvocableSkillCommands(): SlashCommand[] {
  const allSkills = [...loadSkills(), ...loadUserSkills()];
  return allSkills
    .filter(s => s.frontmatter?.user_invocable === true)
    .map(s => ({
      name: `/${s.frontmatter?.name ?? s.name}`,
      description: s.frontmatter?.description ?? `Invoke skill: ${s.name}`,
      argumentHint: s.frontmatter?.argument_hint,
      isSkill: true,
      skillName: s.name,
    }));
}

export function isSkillCommand(name: string): boolean {
  return getInvocableSkillCommands().some(cmd => cmd.name === name);
}

export function filterCommands(input: string): SlashCommand[] {
  if (!input.startsWith("/")) return [];
  const prefix = input.toLowerCase();
  const staticMatches = commands.filter((cmd) => cmd.name.startsWith(prefix));
  const skillMatches = getInvocableSkillCommands().filter((cmd) => cmd.name.startsWith(prefix));
  return [...staticMatches, ...skillMatches];
}

export function getAllCommands(): SlashCommand[] {
  return [...commands, ...getInvocableSkillCommands()];
}
