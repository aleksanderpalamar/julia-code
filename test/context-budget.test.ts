import { describe, expect, it, vi } from 'vitest';

const getContextLengthMock = vi.fn(async () => 32_768);

vi.mock('../src/context/model-info.js', () => ({
  getContextLength: (model: string) => getContextLengthMock(model),
}));

import { computeBudget } from '../src/context/budget.js';

describe('context budget', () => {
  it('uses the same resolved model window passed to the Ollama provider', async () => {
    const budget = await computeBudget('qwen2.5-coder:7b', 'system');

    expect(getContextLengthMock).toHaveBeenCalledWith('qwen2.5-coder:7b');
    expect(budget.total).toBe(32_768);
    expect(budget.available + budget.reservedForOutput).toBe(32_768);
  });
});
