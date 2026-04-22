import { supportsTools } from '../context/model-info.js';
import type { ToolSchema } from '../providers/types.js';

export interface ModelPlan {
  /** Model used for iterations that need tool-calling. */
  loopModel: string;
  /** Model originally requested by the caller. */
  auxModel: string;
  /** True when a dedicated tool-capable model (loopModel) differs from auxModel. */
  hasToolModel: boolean;
  /** True when the aux (requested) model itself supports tool calling. */
  localHasTools: boolean;
}

/**
 * Resolve which models the loop should use:
 * - If the requested model is a cloud model, never override with the local
 *   tool model; the cloud model already handles tool calls.
 * - Otherwise fall back to the configured toolModel for tool-calling
 *   iterations, keeping the requested model as the aux/display model.
 */
export async function resolveModelPlan(
  requestedModel: string,
  configToolModel: string | null | undefined,
): Promise<ModelPlan> {
  const { getAvailableModels } = await import('../config/mcp.js');
  const requestedIsCloud = getAvailableModels().find(m => m.id === requestedModel)?.isCloud ?? false;
  const loopModel = (requestedIsCloud ? null : configToolModel) ?? requestedModel;
  const auxModel = requestedModel;
  const hasToolModel = loopModel !== auxModel;
  const localHasTools = await supportsTools(auxModel);

  return { loopModel, auxModel, hasToolModel, localHasTools };
}

export interface IterationModelChoice {
  model: string;
  tools: ToolSchema[] | undefined;
  useLocalFirst: boolean;
}

/**
 * Pick the model + tool list for a single iteration.
 *
 * On iteration 1, when we have a tool model but the aux model itself cannot
 * call tools, first try the aux model WITHOUT tools (useLocalFirst). If the
 * assistant produces refusal/intent text, the caller flips switchedToCloud
 * and re-enters this function with the tool-capable model.
 */
export function chooseIterationModel(
  plan: ModelPlan,
  iteration: number,
  switchedToCloud: boolean,
  toolSchemas: ToolSchema[],
): IterationModelChoice {
  const useLocalFirst = iteration === 1 && plan.hasToolModel && !plan.localHasTools && !switchedToCloud;

  const model = switchedToCloud
    ? plan.loopModel
    : (useLocalFirst ? plan.auxModel : (plan.localHasTools ? plan.auxModel : plan.loopModel));

  const tools = useLocalFirst ? undefined : toolSchemas;

  return { model, tools, useLocalFirst };
}
