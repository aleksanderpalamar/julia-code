import { describe, it, expect } from 'vitest';
import {
  findAnnouncedToolIntent,
  findDeferredToolIntent,
  needsToolCalling,
} from '../src/agent/heuristics.js';

describe('needsToolCalling / refusal indicators', () => {
  it('detects PT refusals', () => {
    expect(needsToolCalling('Desculpe, não consigo acessar o sistema de arquivos.')).toBe(true);
    expect(needsToolCalling('Infelizmente não tenho acesso aos arquivos.')).toBe(true);
    expect(needsToolCalling('Não posso executar comandos neste ambiente.')).toBe(true);
  });

  it('detects EN refusals', () => {
    expect(needsToolCalling('Sorry, I cannot access the file system.')).toBe(true);
    expect(needsToolCalling("I don't have access to execute commands.")).toBe(true);
    expect(needsToolCalling("I'm unable to run that command.")).toBe(true);
  });

  it('detects deferrals back to the user ("you can run...")', () => {
    expect(needsToolCalling('You can run `ls src/` to see the files.')).toBe(true);
    expect(needsToolCalling('Você pode executar o comando para verificar.')).toBe(true);
  });
});

describe('needsToolCalling / shell patterns', () => {
  it('detects bare shell commands at line start', () => {
    expect(needsToolCalling('ls src/')).toBe(true);
    expect(needsToolCalling('cat package.json')).toBe(true);
    expect(needsToolCalling('git status')).toBe(true);
  });

  it('detects "$ command" prompts', () => {
    expect(needsToolCalling('$ npm test')).toBe(true);
  });

  it('detects fenced shell code blocks', () => {
    expect(needsToolCalling('```bash\nls src/\n```')).toBe(true);
    expect(needsToolCalling('```sh\npwd\n```')).toBe(true);
  });

  it('does not flag prose that merely mentions commands', () => {
    expect(needsToolCalling('The ls command lists directory contents.')).toBe(false);
  });
});

describe('needsToolCalling / intent indicators', () => {
  it('detects PT intent phrases', () => {
    expect(needsToolCalling('Vou verificar o conteúdo do arquivo.')).toBe(true);
    expect(needsToolCalling('Deixa eu ver o que tem lá.')).toBe(true);
    expect(needsToolCalling('Vou ler o arquivo agora.')).toBe(true);
  });

  it('detects EN intent phrases', () => {
    expect(needsToolCalling('Let me check the file.')).toBe(true);
    expect(needsToolCalling("I'll run the tests now.")).toBe(true);
    expect(needsToolCalling('I’ll check the file now.')).toBe(true);
    expect(needsToolCalling('Let me see what is there.')).toBe(true);
  });
});

describe('needsToolCalling / neutral text', () => {
  it('returns false for plain prose without indicators', () => {
    expect(needsToolCalling('A fila de mensagens usa um mutex por sessão.')).toBe(false);
    expect(needsToolCalling('The queue uses a per-session mutex.')).toBe(false);
    expect(needsToolCalling('')).toBe(false);
  });
});

describe('findAnnouncedToolIntent', () => {
  it('returns the earliest positive tool-oriented announcement', () => {
    const text = 'Primeiro um resumo. Depois vou inspecionar os arquivos. Let me check later.';

    expect(findAnnouncedToolIntent(text)).toEqual({
      index: text.indexOf('vou inspecionar'),
      phrase: 'vou inspecionar',
    });
  });

  it('accepts punctuation as the end of an announced action', () => {
    expect(findAnnouncedToolIntent('Vou abrir.')).toEqual({ index: 0, phrase: 'vou abrir' });
    expect(findAnnouncedToolIntent('Vou ler!')).toEqual({ index: 0, phrase: 'vou ler' });
  });

  it('does not treat broad tool need as an announced action', () => {
    expect(findAnnouncedToolIntent('```bash\nnpm test\n```')).toBeNull();
    expect(findAnnouncedToolIntent('Não consigo acessar os arquivos.')).toBeNull();
    expect(findAnnouncedToolIntent('npm test')).toBeNull();
  });

  it('ignores negated Portuguese announcements', () => {
    expect(findAnnouncedToolIntent('Não vou rodar os testes neste exemplo.')).toBeNull();
    expect(findAnnouncedToolIntent('Eu nao vou abrir o arquivo.')).toBeNull();
    expect(findAnnouncedToolIntent('Jamais vou rodar os testes neste exemplo.')).toBeNull();
    expect(findAnnouncedToolIntent('Nunca vou abrir esse arquivo.')).toBeNull();
  });

  it('ignores scoped English negations', () => {
    expect(findAnnouncedToolIntent("I don't think I'll run the tests.")).toBeNull();
    expect(findAnnouncedToolIntent("I cannot promise I'll open that file.")).toBeNull();
    expect(findAnnouncedToolIntent("I never said I'll read it.")).toBeNull();
  });

  it('does not let a negation in a previous clause suppress a positive intent', () => {
    expect(findAnnouncedToolIntent('Não há risco, vou rodar os testes.')).toEqual({
      index: 'Não há risco, '.length,
      phrase: 'vou rodar',
    });
    expect(findAnnouncedToolIntent("I don't know but let me check the file.")).toEqual({
      index: "I don't know but ".length,
      phrase: 'let me check',
    });
    expect(findAnnouncedToolIntent('Não sei mas vou verificar o arquivo.')).toEqual({
      index: 'Não sei mas '.length,
      phrase: 'vou verificar',
    });
    expect(findAnnouncedToolIntent("I don't know — let me open the file.")).toEqual({
      index: "I don't know — ".length,
      phrase: 'let me open',
    });
  });

  it('normalizes typographic apostrophes before matching and scoping', () => {
    expect(findAnnouncedToolIntent('I’ll check the file now.')).toEqual({
      index: 0,
      phrase: "i'll check",
    });
    expect(findAnnouncedToolIntent('I can’t promise I’ll open the file.')).toBeNull();
  });

  it('does not classify internal analysis verbs as tool actions', () => {
    expect(findAnnouncedToolIntent('Vou analisar as duas opções.')).toBeNull();
    expect(findAnnouncedToolIntent('Vou explorar essa ideia com você.')).toBeNull();
  });
});

describe('findDeferredToolIntent', () => {
  it('finds a terminal action announcement', () => {
    expect(findDeferredToolIntent('Para confirmar, vou ler o package.json agora.')).toEqual({
      index: 'Para confirmar, '.length,
      phrase: 'vou ler',
    });
  });

  it('ignores an announcement followed by a substantive answer', () => {
    expect(findDeferredToolIntent(
      'Vou verificar as duas opções. A primeira é mais segura e a segunda é mais rápida.',
    )).toBeNull();
  });

  it('ignores a direct answer completed in the same sentence', () => {
    const mentalAnswer = 'Let me check mentally: 2 + 2 is 4.';
    const explicitAnswer = 'Let me check: the answer is 4.';

    expect(findAnnouncedToolIntent(mentalAnswer)).toBeNull();
    expect(findDeferredToolIntent(mentalAnswer)).toBeNull();
    expect(needsToolCalling(mentalAnswer)).toBe(false);
    expect(findDeferredToolIntent(explicitAnswer)).toBeNull();
  });

  it('keeps a tool target after a colon classified as deferred', () => {
    expect(findDeferredToolIntent('Let me check: package.json')).toEqual({
      index: 0,
      phrase: 'let me check',
    });
    expect(findDeferredToolIntent('Let me check: 2026-report.md')).toEqual({
      index: 0,
      phrase: 'let me check',
    });
    expect(findDeferredToolIntent("Let me check the file, then I'll return with the result.")).toEqual({
      index: 0,
      phrase: 'let me check',
    });
  });

  it('recognizes typographic contractions as deferred intent', () => {
    expect(findDeferredToolIntent('I’ll check the file now.')).toEqual({
      index: 0,
      phrase: "i'll check",
    });
  });
});
