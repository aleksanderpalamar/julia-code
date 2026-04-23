import type { ChatMessage } from '../../providers/types.js';
import { getProvider } from '../../providers/registry.js';
import { listOllamaModels } from '../../providers/ollama.js';
import { log, type PlannerVia } from '../../observability/logger.js';
import { analyzeComplexity } from '../complexity.js';
import { getCachedPlannerResult, setCachedPlannerResult, type CachedPlannerResult } from '../planner-cache.js';
import type { PlannedSubtask } from './types.js';

export type PlanOutcome =
  | { kind: 'simple' }
  | { kind: 'decomposable'; subtasks: PlannedSubtask[]; via: 'llm' | 'cache' };

export interface PlannerDeps {
  sessionId: string;
  userMessage: string;
  model: string;
}

type RawAnalysis = CachedPlannerResult;

export async function planSubtasks(deps: PlannerDeps): Promise<PlanOutcome> {
  const { sessionId, userMessage, model } = deps;
  const plannerStart = Date.now();
  const taskPreview = userMessage.slice(0, 120).replace(/\n/g, ' ');

  const recordDecision = (
    complex: boolean,
    subtaskCount: number,
    via: PlannerVia,
  ): void => {
    log.plannerDecision({
      sessionId,
      complex,
      subtaskCount,
      via,
      durationMs: Date.now() - plannerStart,
      taskPreview,
    });
  };

  if (!analyzeComplexity(userMessage).complex) {
    recordDecision(false, 0, 'heuristic');
    return { kind: 'simple' };
  }

  const availableModels = await listOllamaModels();

  const loaded = await loadOrRunPlanner(sessionId, userMessage, model, availableModels);
  if (!loaded) {
    recordDecision(false, 0, 'llm');
    return { kind: 'simple' };
  }

  const { analysis, via } = loaded;

  const rawSubtasks = analysis.subtasks ?? [];
  if (!analysis.complex || rawSubtasks.length === 0) {
    recordDecision(false, rawSubtasks.length, via);
    return { kind: 'simple' };
  }
  if (rawSubtasks.length === 1) {
    recordDecision(false, 1, via);
    return { kind: 'simple' };
  }

  const subtasks = resolveModelNames(rawSubtasks, availableModels);
  recordDecision(true, subtasks.length, via);
  return { kind: 'decomposable', subtasks, via };
}

async function loadOrRunPlanner(
  sessionId: string,
  userMessage: string,
  model: string,
  availableModels: string[],
): Promise<{ analysis: RawAnalysis; via: 'llm' | 'cache' } | null> {
  const cached = getCachedPlannerResult(sessionId, userMessage);
  if (cached) {
    return { analysis: cached, via: 'cache' };
  }

  const analysis = await runPlannerLLM(userMessage, model, availableModels);
  if (!analysis) return null;

  setCachedPlannerResult(sessionId, userMessage, analysis);
  return { analysis, via: 'llm' };
}

async function runPlannerLLM(
  userMessage: string,
  model: string,
  availableModels: string[],
): Promise<RawAnalysis | null> {
  const messages: ChatMessage[] = [
    { role: 'system', content: buildPlannerSystemPrompt(availableModels) },
    { role: 'user', content: userMessage },
  ];

  let response = '';
  try {
    const stream = getProvider('ollama').chat({ model, messages });
    for await (const chunk of stream) {
      if (chunk.type === 'error') {
        process.stderr.write(`[planner] provider error: ${chunk.error}\n`);
        return null;
      }
      if (chunk.type === 'text' && chunk.text) {
        response += chunk.text;
      }
    }
  } catch (err) {
    process.stderr.write(`[planner] provider threw: ${err instanceof Error ? err.message : String(err)}\n`);
    return null;
  }

  return parsePlannerResponse(response);
}

function parsePlannerResponse(raw: string): RawAnalysis | null {
  let response = raw.trim();
  if (response.startsWith('```')) {
    response = response.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  try {
    return JSON.parse(response) as RawAnalysis;
  } catch (err) {
    process.stderr.write(`[planner] JSON parse failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return null;
  }
}

function resolveModelNames(
  rawSubtasks: Array<{ task: string; model?: string | null }>,
  availableModels: string[],
): PlannedSubtask[] {
  return rawSubtasks.map(sub => {
    const resolved = resolveSingleModel(sub.model ?? undefined, availableModels);
    return { task: sub.task, model: resolved };
  });
}

function resolveSingleModel(
  requested: string | undefined,
  availableModels: string[],
): string | undefined {
  if (!requested || requested === 'null') return undefined;
  if (availableModels.length === 0) return requested;
  if (availableModels.includes(requested)) return requested;

  const match = availableModels.find(m => m.startsWith(requested + ':') || m === requested);
  return match ?? undefined;
}

function buildPlannerSystemPrompt(availableModels: string[]): string {
  const modelsInfo = availableModels.length > 0
    ? `Available models: ${availableModels.join(', ')}`
    : 'No model list available — use null for model to use the default.';

  return `You are a task decomposer. The user task has already been flagged as likely complex by a heuristic — your job is to split it into 2+ independent subtasks that can run in parallel.

Rules:
- Only split into subtasks that are CLEARLY INDEPENDENT (no sequential dependencies between them).
- If, after inspection, the task is actually simple or sequential, return {"complex": false} — this overrides the heuristic.
- If you can only think of 1 subtask, return {"complex": false} (the parent loop will handle it).
- Prefer 2–6 subtasks. Avoid splitting into more parts than are actually independent.

${modelsInfo}

You can assign different models to subtasks based on their nature:
- Use larger/stronger models for complex coding tasks
- Use smaller/faster models for simple file operations or text generation
- Use null to use the default model
- IMPORTANT: You MUST use the EXACT full model name as it appears in the available models list above (including the tag after the colon). Do NOT abbreviate or truncate model names.

Respond with ONLY valid JSON, no markdown, no explanation:
{"complex": false}

OR if decomposable:
{"complex": true, "subtasks": [{"task": "detailed description of subtask 1", "model": "model-name or null"}, ...]}

Each subtask description must be self-contained with ALL context needed (file paths, requirements, style). The subagent will NOT see the original conversation.`;
}
