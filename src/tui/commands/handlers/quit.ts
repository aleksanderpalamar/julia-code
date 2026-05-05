import type { SlashCommand } from "./types.js";

export const quit: SlashCommand = {
  match: (t) => t === "/quit" || t === "/exit",
  handle: (_, ctx) => {
    ctx.exit();
    return true;
  },
};
