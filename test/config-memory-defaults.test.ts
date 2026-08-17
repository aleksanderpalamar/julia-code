import { describe, expect, it } from 'vitest';
import { ConfigSchema, SettingsSchema } from '../src/config/types.js';

describe('semantic memory defaults', () => {
  it('enables the available Ollama embedding provider and startup backfill', () => {
    const config = ConfigSchema.parse({});

    expect(config.memorySemantic).toMatchObject({
      enabled: true,
      provider: 'ollama',
      embeddingModel: 'nomic-embed-text',
      autoBackfillOnStart: true,
    });
  });

  it('allows an explicit opt-out in settings', () => {
    const settings = SettingsSchema.parse({
      memory: {
        semantic: {
          enabled: false,
          autoBackfillOnStart: false,
        },
      },
    });

    expect(settings.memory?.semantic).toMatchObject({
      enabled: false,
      autoBackfillOnStart: false,
    });
  });
});
