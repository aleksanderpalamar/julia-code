import type { SlashCommand } from "./types.js";

export const clear: SlashCommand = {
  match: (t) => t === "/clear",
  handle: () => true,
};
