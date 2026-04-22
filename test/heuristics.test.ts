import { describe, it, expect } from 'vitest';
import { needsToolCalling } from '../src/agent/heuristics.js';

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
