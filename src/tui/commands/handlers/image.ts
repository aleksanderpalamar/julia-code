import type { SlashCommand } from "./types.js";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const VALID_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
const MAX_SIZE = 10 * 1024 * 1024;

export const image: SlashCommand = {
  match: (t) =>
    t === "/image" ||
    t === "/image list" ||
    t === "/image clear" ||
    t.startsWith("/image "),
  handle: (text, ctx) => {
    if (text === "/image list") {
      if (ctx.pendingImageNames.length === 0) {
        ctx.addSystemEntry("No images attached.");
      } else {
        const lines = ctx.pendingImageNames.map(
          (name, i) => `  [Image #${i + 1}] ${name}`,
        );
        ctx.addSystemEntry("Pending images:\n" + lines.join("\n"));
      }
      return true;
    }

    if (text === "/image clear") {
      ctx.setPendingImages([]);
      ctx.setPendingImageNames([]);
      ctx.addSystemEntry("All pending images cleared.");
      return true;
    }

    if (text.startsWith("/image ")) {
      const imgPath = text.slice("/image ".length).trim();
      if (!imgPath) {
        ctx.addSystemEntry("Usage: /image <path> | list | clear");
        return true;
      }
      try {
        const resolved = resolve(imgPath);
        const ext = resolved.toLowerCase().slice(resolved.lastIndexOf("."));
        if (!VALID_EXTENSIONS.includes(ext)) {
          ctx.addSystemEntry(
            `Invalid image format '${ext}'. Supported: ${VALID_EXTENSIONS.join(", ")}`,
          );
          return true;
        }
        const stat = statSync(resolved);
        if (stat.size > MAX_SIZE) {
          ctx.addSystemEntry(
            `Image too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max: 10MB`,
          );
          return true;
        }
        const base64 = readFileSync(resolved).toString("base64");
        const fileName = resolved.split("/").pop() ?? imgPath;
        ctx.setPendingImages((prev) => [...prev, base64]);
        ctx.setPendingImageNames((prev) => [...prev, fileName]);
        const count = ctx.pendingImages.length + 1;
        ctx.addSystemEntry(`[Image #${count}] attached: ${fileName}`);
      } catch (err) {
        ctx.addSystemEntry(
          `Failed to read image: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return true;
    }

    ctx.addSystemEntry("Usage: /image <path> | list | clear");
    return true;
  },
};
