import { supportsTools } from '../context/model-info.js';
import type { ToolSchema } from '../providers/types.js';

export interface ModelPlan {
  loopModel: string;
  auxModel: string;
  hasToolModel: boolean;
  localHasTools: boolean;
  /**
   * Small model that picks tools when strategic routing is enabled. Gather
   * iterations run on it; the requested model synthesises the final answer.
   * Null disables routing — behaviour is then identical to before.
   */
  routeTools: string | null;
}

export async function resolveModelPlan(
  requestedModel: string,
  configToolModel: string | null | undefined,
  configRouteTools?: string | null | undefined,
): Promise<ModelPlan> {
  const { getAvailableModels } = await import('../config/mcp.js');
  const requestedIsCloud = getAvailableModels().find(m => m.id === requestedModel)?.isCloud ?? false;
  const loopModel = (requestedIsCloud ? null : configToolModel) ?? requestedModel;
  const auxModel = requestedModel;
  const hasToolModel = loopModel !== auxModel;
  const localHasTools = await supportsTools(auxModel);
  const routeTools = await resolveRouteTools(configRouteTools, auxModel);

  return { loopModel, auxModel, hasToolModel, localHasTools, routeTools };
}

/**
 * Validates the configured routing model. Routing is disabled (returns null)
 * when it is unset, identical to the requested model, or cannot call tools —
 * routing a tool-pick step to a tool-less model would be pointless.
 */
async function resolveRouteTools(
  configRouteTools: string | null | undefined,
  auxModel: string,
): Promise<string | null> {
  const candidate = configRouteTools ?? null;
  if (!candidate || candidate === auxModel) return null;

  if (!(await supportsTools(candidate))) {
    process.stderr.write(
      `[model-routing] routeTools model "${candidate}" does not support tools; routing disabled\n`,
    );
    return null;
  }
  return candidate;
}

interface IterationModelChoice {
  model: string;
  tools: ToolSchema[] | undefined;
  useLocalFirst: boolean;
}

export function chooseIterationModel(
  plan: ModelPlan,
  iteration: number,
  switchedToCloud: boolean,
  toolSchemas: ToolSchema[],
): IterationModelChoice {
  // Strategic routing takes precedence: every gather iteration runs on the
  // small tool-pick model. The requested model synthesises the answer in a
  // separate pass (see runOneIteration), so the tool-less-fallback dance
  // below is not needed here.
  if (plan.routeTools) {
    return { model: plan.routeTools, tools: toolSchemas, useLocalFirst: false };
  }

  const useLocalFirst = iteration === 1 && plan.hasToolModel && !plan.localHasTools && !switchedToCloud;

  const model = switchedToCloud
    ? plan.loopModel
    : (useLocalFirst ? plan.auxModel : (plan.localHasTools ? plan.auxModel : plan.loopModel));

  const tools = useLocalFirst ? undefined : toolSchemas;

  return { model, tools, useLocalFirst };
}
