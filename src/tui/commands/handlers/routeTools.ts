import type { SlashCommand } from "./types.js";
import {
  getAvailableModels,
  setRouteTools,
  clearRouteTools,
} from "../../../config/mcp.js";
import { getConfig, reloadConfig } from "../../../config/index.js";

const COMMAND = "/routetools";

/** Multi-line help shown when the command is typed with no argument. */
function helpText(): string {
  const current = getConfig().routeTools;
  const available = getAvailableModels()
    .map((m) => m.id)
    .join(", ");
  return [
    "Tool routing splits one turn between two models:",
    "  • a small model runs the tool-calling loop (read, grep, edit, ...)",
    "  • your main model writes the final answer.",
    "Unlike /toolmodel — which replaces your model entirely — this keeps your",
    "main model for the answer and only offloads the mechanical tool steps.",
    `Current: ${current ?? "(off — your main model does everything)"}`,
    `Usage: ${COMMAND} <model>   enable routing through that model`,
    `       ${COMMAND} off       disable routing`,
    `Available: ${available || "(none)"}`,
  ].join("\n");
}

export const routeTools: SlashCommand = {
  match: (t) => t === COMMAND || t.startsWith(`${COMMAND} `),
  handle: (text, ctx) => {
    if (text === COMMAND) {
      ctx.addSystemEntry(helpText());
      return true;
    }

    const name = text.slice(`${COMMAND} `.length).trim();
    if (!name) {
      ctx.addSystemEntry(`Usage: ${COMMAND} <model> | ${COMMAND} off`);
      return true;
    }
    if (name === "off") {
      clearRouteTools();
      reloadConfig();
      ctx.addSystemEntry("Tool routing disabled — your main model handles the whole turn.");
      return true;
    }
    const match = getAvailableModels().find((m) => m.id === name);
    if (!match) {
      ctx.addSystemEntry(
        `Model '${name}' not found. Run ${COMMAND} to see available models.`,
      );
      return true;
    }
    setRouteTools(name);
    reloadConfig();
    ctx.addSystemEntry(
      `Tool routing enabled: '${name}' picks tools, your main model writes the answer.`,
    );
    return true;
  },
};
