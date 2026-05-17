import type { SlashCommand } from "./types.js";
import {
  getAvailableModels,
  setToolPickModel,
  clearToolPickModel,
} from "../../../config/mcp.js";
import { getConfig, reloadConfig } from "../../../config/index.js";

export const toolPickModel: SlashCommand = {
  match: (t) => t === "/toolpickmodel" || t.startsWith("/toolpickmodel "),
  handle: (text, ctx) => {
    if (text === "/toolpickmodel") {
      const current = getConfig().toolPickModel;
      const available = getAvailableModels().map((m) => m.id).join(", ");
      ctx.addSystemEntry(
        "Tool-pick routing: a small model picks tools, the requested model synthesizes.\n" +
          `Current: ${current ?? "(off)"}\n` +
          "Usage: /toolpickmodel [name|auto]\n" +
          `Available: ${available || "(none)"}`,
      );
      return true;
    }

    const name = text.slice("/toolpickmodel ".length).trim();
    if (!name) {
      ctx.addSystemEntry("Usage: /toolpickmodel [name|auto]");
      return true;
    }
    if (name === "auto" || name === "off") {
      clearToolPickModel();
      reloadConfig();
      ctx.addSystemEntry("Tool-pick routing disabled.");
      return true;
    }
    const match = getAvailableModels().find((m) => m.id === name);
    if (!match) {
      ctx.addSystemEntry(
        `Model '${name}' not found. Use /toolpickmodel to see available models.`,
      );
      return true;
    }
    setToolPickModel(name);
    reloadConfig();
    ctx.addSystemEntry(`Tool-pick model set to: ${name}`);
    return true;
  },
};
