import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolSchema } from '../src/providers/types.js';
import { chooseIterationModel, resolveModelPlan, type ModelPlan } from '../src/agent/model-selection.js';

vi.mock('../src/context/model-info.js', () => ({
  supportsTools: vi.fn(),
}));

vi.mock('../src/config/mcp.js', () => ({
  getAvailableModels: vi.fn(),
}));

import { supportsTools } from '../src/context/model-info.js';
import { getAvailableModels } from '../src/config/mcp.js';

const toolSchemas: ToolSchema[] = [
  { type: 'function', function: { name: 'read', description: '', parameters: {} } as any },
];

beforeEach(() => {
  vi.mocked(supportsTools).mockReset();
  vi.mocked(getAvailableModels).mockReset();
});

describe('resolveModelPlan', () => {
  it('keeps a cloud model as loopModel (no fallback to toolModel)', async () => {
    vi.mocked(getAvailableModels).mockReturnValue([{ id: 'claude-sonnet', isCloud: true }]);
    vi.mocked(supportsTools).mockResolvedValue(true);

    const plan = await resolveModelPlan('claude-sonnet', 'qwen2.5-coder');

    expect(plan.loopModel).toBe('claude-sonnet');
    expect(plan.auxModel).toBe('claude-sonnet');
    expect(plan.hasToolModel).toBe(false);
    expect(plan.localHasTools).toBe(true);
  });

  it('falls back to toolModel for a local model without tool support', async () => {
    vi.mocked(getAvailableModels).mockReturnValue([{ id: 'llama3', isCloud: false }]);
    vi.mocked(supportsTools).mockResolvedValue(false);

    const plan = await resolveModelPlan('llama3', 'qwen2.5-coder');

    expect(plan.loopModel).toBe('qwen2.5-coder');
    expect(plan.auxModel).toBe('llama3');
    expect(plan.hasToolModel).toBe(true);
    expect(plan.localHasTools).toBe(false);
  });

  it('keeps a local tool-capable model as loopModel when toolModel is undefined', async () => {
    vi.mocked(getAvailableModels).mockReturnValue([{ id: 'qwen2.5-coder', isCloud: false }]);
    vi.mocked(supportsTools).mockResolvedValue(true);

    const plan = await resolveModelPlan('qwen2.5-coder', undefined);

    expect(plan.loopModel).toBe('qwen2.5-coder');
    expect(plan.auxModel).toBe('qwen2.5-coder');
    expect(plan.hasToolModel).toBe(false);
    expect(plan.localHasTools).toBe(true);
  });

  it('treats missing isCloud flag as local', async () => {
    vi.mocked(getAvailableModels).mockReturnValue([{ id: 'phi3' }]);
    vi.mocked(supportsTools).mockResolvedValue(false);

    const plan = await resolveModelPlan('phi3', 'qwen2.5-coder');

    expect(plan.loopModel).toBe('qwen2.5-coder');
    expect(plan.hasToolModel).toBe(true);
  });
});

describe('chooseIterationModel', () => {
  const cloudPlan: ModelPlan = {
    loopModel: 'claude-sonnet',
    auxModel: 'claude-sonnet',
    hasToolModel: false,
    localHasTools: true,
    toolPickModel: null,
  };

  const localToolCapablePlan: ModelPlan = {
    loopModel: 'qwen2.5-coder',
    auxModel: 'qwen2.5-coder',
    hasToolModel: false,
    localHasTools: true,
    toolPickModel: null,
  };

  const fallbackPlan: ModelPlan = {
    loopModel: 'qwen2.5-coder',
    auxModel: 'llama3',
    hasToolModel: true,
    localHasTools: false,
    toolPickModel: null,
  };

  const toolCapableAuxWithToolModelPlan: ModelPlan = {
    loopModel: 'qwen2.5-coder',
    auxModel: 'another-tool-model',
    hasToolModel: true,
    localHasTools: true,
    toolPickModel: null,
  };

  const routingPlan: ModelPlan = {
    loopModel: 'qwen-big',
    auxModel: 'qwen-big',
    hasToolModel: false,
    localHasTools: true,
    toolPickModel: 'qwen-small',
  };

  it('cloud plan always uses loopModel with tools', () => {
    const it1 = chooseIterationModel(cloudPlan, 1, false, toolSchemas);
    expect(it1).toEqual({ model: 'claude-sonnet', tools: toolSchemas, useLocalFirst: false });

    const it2 = chooseIterationModel(cloudPlan, 2, false, toolSchemas);
    expect(it2).toEqual({ model: 'claude-sonnet', tools: toolSchemas, useLocalFirst: false });
  });

  it('fallback plan tries aux WITHOUT tools on iteration 1 (useLocalFirst)', () => {
    const choice = chooseIterationModel(fallbackPlan, 1, false, toolSchemas);
    expect(choice).toEqual({ model: 'llama3', tools: undefined, useLocalFirst: true });
  });

  it('fallback plan uses loopModel with tools from iteration 2 onward', () => {
    const choice = chooseIterationModel(fallbackPlan, 2, false, toolSchemas);
    expect(choice).toEqual({ model: 'qwen2.5-coder', tools: toolSchemas, useLocalFirst: false });
  });

  it('switchedToCloud forces loopModel with tools even on iteration 1', () => {
    const choice = chooseIterationModel(fallbackPlan, 1, true, toolSchemas);
    expect(choice).toEqual({ model: 'qwen2.5-coder', tools: toolSchemas, useLocalFirst: false });
  });

  it('local tool-capable plan uses auxModel with tools', () => {
    const choice = chooseIterationModel(localToolCapablePlan, 1, false, toolSchemas);
    expect(choice).toEqual({ model: 'qwen2.5-coder', tools: toolSchemas, useLocalFirst: false });
  });

  it('tool-capable aux + hasToolModel prefers auxModel with tools (no useLocalFirst)', () => {
    const choice = chooseIterationModel(toolCapableAuxWithToolModelPlan, 1, false, toolSchemas);
    expect(choice).toEqual({ model: 'another-tool-model', tools: toolSchemas, useLocalFirst: false });
  });

  it('routing plan uses toolPickModel with tools on every gather iteration', () => {
    expect(chooseIterationModel(routingPlan, 1, false, toolSchemas))
      .toEqual({ model: 'qwen-small', tools: toolSchemas, useLocalFirst: false });
    expect(chooseIterationModel(routingPlan, 4, false, toolSchemas))
      .toEqual({ model: 'qwen-small', tools: toolSchemas, useLocalFirst: false });
  });
});

describe('resolveModelPlan — tool-pick routing', () => {
  it('enables routing when toolPickModel is set and supports tools', async () => {
    vi.mocked(getAvailableModels).mockReturnValue([{ id: 'qwen-big', isCloud: false }]);
    vi.mocked(supportsTools).mockResolvedValue(true);

    const plan = await resolveModelPlan('qwen-big', null, 'qwen-small');

    expect(plan.toolPickModel).toBe('qwen-small');
  });

  it('disables routing when toolPickModel cannot call tools', async () => {
    vi.mocked(getAvailableModels).mockReturnValue([{ id: 'qwen-big', isCloud: false }]);
    vi.mocked(supportsTools).mockImplementation(async (m: string) => m !== 'weak-pick');

    const plan = await resolveModelPlan('qwen-big', null, 'weak-pick');

    expect(plan.toolPickModel).toBeNull();
  });

  it('disables routing when toolPickModel equals the requested model', async () => {
    vi.mocked(getAvailableModels).mockReturnValue([{ id: 'qwen-big', isCloud: false }]);
    vi.mocked(supportsTools).mockResolvedValue(true);

    const plan = await resolveModelPlan('qwen-big', null, 'qwen-big');

    expect(plan.toolPickModel).toBeNull();
  });

  it('leaves routing off when toolPickModel is not configured', async () => {
    vi.mocked(getAvailableModels).mockReturnValue([{ id: 'qwen-big', isCloud: false }]);
    vi.mocked(supportsTools).mockResolvedValue(true);

    const plan = await resolveModelPlan('qwen-big', null);

    expect(plan.toolPickModel).toBeNull();
  });
});
