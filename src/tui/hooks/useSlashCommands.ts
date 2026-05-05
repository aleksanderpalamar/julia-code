import { useCallback } from "react";
import { slashCommands } from "../commands/handlers/index.js";
import type { SlashCommandContext } from "../commands/handlers/types.js";

export function useSlashCommands(ctx: SlashCommandContext) {
  return useCallback(
    async (text: string): Promise<boolean> => {
      for (const cmd of slashCommands) {
        if (cmd.match(text)) {
          const handled = await cmd.handle(text, ctx);
          if (handled) return true;
        }
      }
      return false;
    },
    [ctx],
  );
}
