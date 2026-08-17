import { describe, expect, it } from 'vitest';
import { buildIdentityReminder } from '../src/agent/identity.js';

describe('buildIdentityReminder', () => {
  it('separates questions about Julia from questions about the user', () => {
    const reminder = buildIdentityReminder();

    expect(reminder).toContain('"Quem é você?"');
    expect(reminder).toContain('"Quem sou eu?"');
    expect(reminder).toContain('perguntam sobre o usuário humano');
    expect(reminder).toContain('Nunca combine a identidade da Julia com os fatos do usuário');
  });

  it('directs user identity questions to the user facts block', () => {
    const reminder = buildIdentityReminder();

    expect(reminder).toContain('Fatos sobre o usuário humano');
    expect(reminder).toContain('começando com "Você" ou "You"');
    expect(reminder).not.toContain('If asked your name, identity');
  });
});
