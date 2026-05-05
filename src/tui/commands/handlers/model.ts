import type { SlashCommand } from "./types.js";
import { getAvailableModels, setDefaultModel } from "../../../config/mcp.js";
import { reloadConfig } from "../../../config/index.js";

export const model: SlashCommand = {
  match: (t) => t === "/model" || t.startsWith("/model "),
  handle: (text, ctx) => {
    if (text === "/model") {
      ctx.setShowModelPicker(true);
      return true;
    }

    const name = text.slice("/model ".length).trim();
    if (!name) {
      ctx.addSystemEntry("Usage: /model [name]");
      return true;
    }
    const available = getAvailableModels();
    const match = available.find((m) => m.id === name);
    if (!match) {
      ctx.addSystemEntry(
        `Model '${name}' not found. Use /model to see available models.`,
      );
      return true;
    }
    setDefaultModel(name);
    reloadConfig();
    ctx.setModel(name);
    ctx.addSystemEntry(`Model switched to: ${name}`);
    return true;
  },
};
