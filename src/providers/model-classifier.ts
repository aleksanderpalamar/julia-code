/**
 * Model classifier — detects local vs cloud models from Ollama API data
 * and auto-selects the best toolModel.
 */

export interface OllamaModelEntry {
  name: string;
  model: string;
  remote_model?: string;
  remote_host?: string;
  size: number;
  details?: {
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
}

export interface ModelClassification {
  id: string;
  isCloud: boolean;
  isLocal: boolean;
  parameterSize: string;
  parameterSizeNum: number;  // parsed numeric value in billions
  quantization: string;
}

/**
 * Classify models from Ollama /api/tags response as local or cloud.
 * Cloud models have remote_model and remote_host fields.
 */
export function classifyModels(ollamaModels: OllamaModelEntry[]): ModelClassification[] {
  return ollamaModels.map(m => {
    const isCloud = !!(m.remote_model && m.remote_host);
    return {
      id: m.name,
      isCloud,
      isLocal: !isCloud,
      parameterSize: m.details?.parameter_size ?? '',
      parameterSizeNum: parseParameterSize(m.details?.parameter_size ?? ''),
      quantization: m.details?.quantization_level ?? '',
    };
  });
}

/**
 * Auto-select the best cloud model for tool calling.
 * Returns null if the current default is already cloud or no cloud models available.
 */
export function selectToolModel(
  models: ModelClassification[],
  currentDefault: string,
): string | null {
  // If current default is already cloud, no need for a separate tool model
  const current = models.find(m => m.id === currentDefault);
  if (current?.isCloud) return null;

  // Find available cloud models, sorted by parameter size (largest first)
  const cloudModels = models
    .filter(m => m.isCloud)
    .sort((a, b) => b.parameterSizeNum - a.parameterSizeNum);

  return cloudModels.length > 0 ? cloudModels[0].id : null;
}

/**
 * Select the best local model for fast responses.
 * Picks the largest local model available.
 */
export function selectFastModel(
  models: ModelClassification[],
): string | null {
  const localModels = models
    .filter(m => m.isLocal)
    .sort((a, b) => b.parameterSizeNum - a.parameterSizeNum);

  return localModels.length > 0 ? localModels[0].id : null;
}

/**
 * Parse parameter size strings like "9.7B", "397B", "4.0B", "671B" into numeric billions.
 */
function parseParameterSize(size: string): number {
  if (!size) return 0;
  const match = size.match(/^([\d.]+)\s*B$/i);
  if (!match) return 0;
  return parseFloat(match[1]);
}
