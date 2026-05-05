import type { SlashCommand } from "./types.js";
import { getAllMetrics, formatMetricsForDisplay } from "../../../observability/metrics.js";

export const stats: SlashCommand = {
  match: (t) => t === "/stats",
  handle: async (_, ctx) => {
    try {
      const metrics = await getAllMetrics();
      ctx.addSystemEntry(formatMetricsForDisplay(metrics));
    } catch (err) {
      ctx.addSystemEntry(
        `Failed to compute stats: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return true;
  },
};
