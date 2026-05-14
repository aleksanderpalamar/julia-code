import { describe, it, expect } from 'vitest';
import { HooksSchema } from '../src/hooks/schema.js';
import { SettingsSchema } from '../src/config/types.js';

describe('HooksSchema', () => {
  it('accepts empty hooks object', () => {
    const parsed = HooksSchema.parse({});
    expect(parsed).toEqual({});
  });

  it('accepts every event with one command entry', () => {
    const input = {
      PreToolUse: [{ matcher: 'exec', hooks: [{ type: 'command' as const, command: 'audit.sh' }] }],
      PostToolUse: [{ matcher: 'write', hooks: [{ command: 'lint.sh' }] }],
      UserPromptSubmit: [{ hooks: [{ command: 'inject.sh' }] }],
      Stop: [{ hooks: [{ command: 'continue.sh' }] }],
      SubagentStop: [{ hooks: [{ command: 'sub-cleanup.sh' }] }],
      SessionStart: [{ hooks: [{ command: 'preload.sh' }] }],
      Notification: [{ hooks: [{ command: 'notify.sh' }] }],
      PreCompact: [{ hooks: [{ command: 'archive.sh' }] }],
    };
    const parsed = HooksSchema.parse(input);
    expect(parsed?.PreToolUse?.[0].hooks[0].command).toBe('audit.sh');
    expect(parsed?.PostToolUse?.[0].hooks[0].type).toBe('command');
  });

  it('defaults type to "command" when omitted', () => {
    const parsed = HooksSchema.parse({
      PreToolUse: [{ hooks: [{ command: 'x' }] }],
    });
    expect(parsed?.PreToolUse?.[0].hooks[0].type).toBe('command');
  });

  it('accepts optional timeout per command', () => {
    const parsed = HooksSchema.parse({
      PreToolUse: [{ hooks: [{ command: 'slow.sh', timeout: 5000 }] }],
    });
    expect(parsed?.PreToolUse?.[0].hooks[0].timeout).toBe(5000);
  });
});

describe('SettingsSchema with hooks', () => {
  it('parses settings.json with hooks block', () => {
    const settings = SettingsSchema.parse({
      meta: { version: '0.8.0' },
      hooks: {
        PreToolUse: [{ matcher: 'exec', hooks: [{ command: 'echo guarded' }] }],
      },
    });
    expect(settings.hooks?.PreToolUse?.[0].matcher).toBe('exec');
  });

  it('parses settings.json without hooks (backward compat)', () => {
    const settings = SettingsSchema.parse({ meta: { version: '0.7.0' } });
    expect(settings.hooks).toBeUndefined();
  });
});
