import { supportsTools } from '../context/model-info.js';
import type { ToolSchema } from '../providers/types.js';

export interface ModelPlan {
  loopModel: string;
  auxModel: string;
  hasToolModel: boolean;
  localHasTools: boolean;
}

export async function resolveModelPlan(
  requestedModel: string,
  configToolModel: string | null | undefined,
): Promise<ModelPlan> {
  const { getAvailableModels } = await import('../config/mcp.js');
  const { getConfig } = await import('../config/index.js');
  const requestedIsCloud = getAvailableModels().find(m => m.id === requestedModel)?.isCloud ?? false;
  const isNonOllamaProvider = getConfig().provider !== 'ollama';
  const loopModel = (requestedIsCloud || isNonOllamaProvider ? null : configToolModel) ?? requestedModel;
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
