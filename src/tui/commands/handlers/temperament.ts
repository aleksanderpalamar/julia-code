import type { SlashCommand } from "./types.js";
import { nextTemperament, temperamentLabel } from "../../types.js";
import type { Temperament } from "../../types.js";

export const temperament: SlashCommand = {
  match: (t) => t === "/temperament" || t.startsWith("/temperament "),
  handle: (text, ctx) => {
    if (text === "/temperament") {
      ctx.setTemperament((prev) => {
        const n = nextTemperament(prev);
        ctx.addSystemEntry(`Temperament: ${temperamentLabel(n) || "neutral"}`);
        return n;
      });
      return true;
    }

    const value = text.slice("/temperament ".length).trim().toLowerCase();
    const valid: Temperament[] = ["neutral", "sharp", "warm", "auto"];
    if (!valid.includes(value as Temperament)) {
      ctx.addSystemEntry(
        `Invalid temperament '${value}'. Valid: ${valid.join(", ")}`,
      );
      return true;
    }
    ctx.setTemperament(value as Temperament);
    ctx.addSystemEntry(
      `Temperament: ${temperamentLabel(value as Temperament) || "neutral"}`,
    );
    return true;
  },
};
