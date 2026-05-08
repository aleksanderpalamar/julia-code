export function buildSpawnAnnouncement(subtaskCount: number, runId: string): string {
  return `🔀 Complex task detected - spawning ${subtaskCount} subagents... (run: ${runId.slice(0, 8)})\n\n`;
}

export function buildCompletionSummary(completed: number, failed: number): string {
  return `\n✅ ${completed} completed, ${failed > 0 ? `❌ ${failed} failed` : 'no flaws'}\n\n`;
}

export function buildResultsText(resultLines: string[]): string {
  return resultLines.filter(Boolean).join('\n\n---\n\n');
}

export function buildFinalOutput(input: {
  subtaskCount: number;
  completed: number;
  failed: number;
  resultsText: string;
  synthesisText: string;
}): string {
  const { subtaskCount, completed, failed, resultsText, synthesisText } = input;
  const tail = synthesisText ? `\n\n${synthesisText}` : '';
  return `🔀 ${subtaskCount} executed subagents (${completed} ok, ${failed} failed)\n\n${resultsText}${tail}`;
}
