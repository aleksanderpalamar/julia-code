import type { SlashCommand } from "./types.js";
import { setDiagnosticsCommand, clearDiagnosticsCommand } from "../../../config/mcp.js";
import { getConfig, reloadConfig } from "../../../config/index.js";

const COMMAND = "/diagnostics";

/** Multi-line help shown when the command is typed with no argument. */
function helpText(): string {
  const current = getConfig().diagnosticsCommand;
  return [
    "Diagnostics run your project's check after each edit and feed the errors",
    "back to the model, so it can fix what it broke on the next iteration.",
    `Current: ${current ?? "(off)"}`,
    `Usage: ${COMMAND} <command>   e.g. ${COMMAND} tsc --noEmit`,
    `       ${COMMAND} off         disable diagnostics`,
  ].join("\n");
}

export const diagnostics: SlashCommand = {
  match: (t) => t === COMMAND || t.startsWith(`${COMMAND} `),
  handle: (text, ctx) => {
    if (text === COMMAND) {
      ctx.addSystemEntry(helpText());
      return true;
    }

    // The argument is a full shell command (with spaces), so keep it verbatim.
    const arg = text.slice(`${COMMAND} `.length).trim();
    if (!arg) {
      ctx.addSystemEntry(`Usage: ${COMMAND} <command> | ${COMMAND} off`);
      return true;
    }
    if (arg === "off") {
      clearDiagnosticsCommand();
      reloadConfig();
      ctx.addSystemEntry("Diagnostics disabled.");
      return true;
    }
    setDiagnosticsCommand(arg);
    reloadConfig();
    ctx.addSystemEntry(`Diagnostics enabled: '${arg}' runs after each edit.`);
    return true;
  },
};
