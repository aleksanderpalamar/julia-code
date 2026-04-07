
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
  parameterSizeNum: number;    quantization: string;
}

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

export function selectToolModel(
  models: ModelClassification[],
  currentDefault: string,
): string | null {
  const current = models.find(m => m.id === currentDefault);
  if (current?.isCloud) return null;

  const cloudModels = models
    .filter(m => m.isCloud)
    .sort((a, b) => b.parameterSizeNum - a.parameterSizeNum);

  return cloudModels.length > 0 ? cloudModels[0].id : null;
}

export function selectFastModel(
  models: ModelClassification[],
): string | null {
  const localModels = models
    .filter(m => m.isLocal)
    .sort((a, b) => b.parameterSizeNum - a.parameterSizeNum);

  return localModels.length > 0 ? localModels[0].id : null;
}

function parseParameterSize(size: string): number {
  if (!size) return 0;
  const match = size.match(/^([\d.]+)\s*B$/i);
  if (!match) return 0;
  return parseFloat(match[1]);
}
