import { describe, it, expect } from 'vitest';
import { findAnnouncedToolIntent, needsToolCalling } from '../src/agent/heuristics.js';

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
  });
});
