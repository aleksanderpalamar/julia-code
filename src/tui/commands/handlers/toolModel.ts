import type { SlashCommand } from "./types.js";
import {
  getAvailableModels,
  setToolModel,
  clearToolModel,
} from "../../../config/mcp.js";
import { reloadConfig } from "../../../config/index.js";

export const toolModel: SlashCommand = {
  match: (t) => t === "/toolmodel" || t.startsWith("/toolmodel "),
  handle: (text, ctx) => {
    if (text === "/toolmodel") {
      ctx.setShowToolModelPicker(true);
      return true;
    }

    const name = text.slice("/toolmodel ".length).trim();
    if (!name) {
      ctx.addSystemEntry("Usage: /toolmodel [name|auto]");
      return true;
    }
    if (name === "auto") {
      clearToolModel();
      reloadConfig();
      ctx.addSystemEntry("Tool model reset to auto-switch.");
      return true;
    }
    const available = getAvailableModels();
    const match = available.find((m) => m.id === name);
    if (!match) {
      ctx.addSystemEntry(
        `Model '${name}' not found. Use /toolmodel to see available models.`,
      );
      return true;
    }
    setToolModel(name);
    reloadConfig();
    ctx.addSystemEntry(`Tool model switched to: ${name}`);
    return true;
  },
};
