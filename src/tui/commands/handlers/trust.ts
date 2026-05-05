import type { SlashCommand } from "./types.js";
import {
  untrustDirectory,
  untrustAll,
  getTrustedDirectories,
} from "../../../config/trust.js";

export const trust: SlashCommand = {
  match: (t) => t === "/trust" || t.startsWith("/trust"),
  handle: (text, ctx) => {
    if (text === "/trust" || text === "/trust list") {
      const dirs = getTrustedDirectories();
      if (dirs.length === 0) {
        ctx.addSystemEntry("No trusted directories.");
      } else {
        ctx.addSystemEntry(
          "Trusted directories:\n" + dirs.map((d) => `  - ${d}`).join("\n"),
        );
      }
      return true;
    }

    if (text.startsWith("/trust revoke-all")) {
      untrustAll();
      ctx.addSystemEntry("All trusted directories have been revoked.");
      return true;
    }

    if (text.startsWith("/trust revoke ")) {
      const path = text.slice("/trust revoke ".length).trim();
      if (!path) {
        ctx.addSystemEntry("Usage: /trust revoke <path>");
        return true;
      }
      untrustDirectory(path);
      ctx.addSystemEntry(`Revoked trust for: ${path}`);
      if (path === ctx.projectDir) {
        ctx.setTrusted(false);
      }
      return true;
    }

    ctx.addSystemEntry(
      "Usage:\n  /trust             — list trusted dirs\n  /trust revoke <path> — revoke trust\n  /trust revoke-all    — revoke all",
    );
    return true;
  },
};
