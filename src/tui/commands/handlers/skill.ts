import type { SlashCommand } from "./types.js";
import { getInvocableSkillCommands } from "../registry.js";
import { loadSkills, loadUserSkills, applyArguments } from "../../../skills/loader.js";

export const skill: SlashCommand = {
  match: (t) => t.startsWith("/"),
  handle: (text, ctx) => {
    const skillCmds = getInvocableSkillCommands();
    const skillCmd = skillCmds.find(
      (cmd) => text === cmd.name || text.startsWith(cmd.name + " "),
    );
    if (!skillCmd?.skillName) return false;

    const args =
      text.length > skillCmd.name.length
        ? text.slice(skillCmd.name.length + 1).trim()
        : "";
    if (!args) {
      ctx.addSystemEntry(
        `Usage: ${skillCmd.name} <your request>${
          skillCmd.argumentHint ? ` (${skillCmd.argumentHint})` : ""
        }`,
      );
      return true;
    }

    const allSkills = [...loadSkills(), ...loadUserSkills()];
    const found = allSkills.find((s) => s.name === skillCmd.skillName);
    if (!found) return false;

    const imagesToSend =
      ctx.pendingImages.length > 0 ? [...ctx.pendingImages] : undefined;
    if (imagesToSend) {
      ctx.setPendingImages([]);
      ctx.setPendingImageNames([]);
    }

    ctx.addSystemEntry(`[Skill ativada: ${skillCmd.skillName}]`);
    ctx.sendMessage(
      ctx.session.id,
      args,
      ctx.model,
      ctx.mode,
      imagesToSend,
      ctx.temperament,
      applyArguments(found.content, args),
    );
    return true;
  },
};
