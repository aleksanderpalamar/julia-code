import type { SlashCommand } from "./types.js";
import { nextMode, modeLabel } from "../../types.js";

export const mode: SlashCommand = {
  match: (t) => t === "/mode",
  handle: (_, ctx) => {
    ctx.setMode((prev) => {
      const n = nextMode(prev);
      ctx.addSystemEntry(`Mode: ${modeLabel(n) || "normal"}`);
      return n;
    });
    return true;
  },
};
