import { estimateTokens } from '../context/token-counter.js';
import type { RankedMemory } from './types.js';

export const USER_FACTS_HEADING = `## Fatos sobre o usuário humano / Facts about the human user`;

export const USER_FACTS_HEADER_LINES = [
  USER_FACTS_HEADING,
  `Os fatos abaixo pertencem ao usuário humano, nunca à Julia. The facts below belong to the human user, never Julia.`,
  `Se a pergunta for "quem sou eu?", "qual é meu nome?", "who am I?" ou "what is my name?", responda usando estes fatos em segunda pessoa, começando com "Você" ou "You".`,
  `Não diga "Eu sou a Julia" e não diga que não sabe quando estes fatos responderem à pergunta.`,
  `Nunca apresente nome, identidade, histórico, empregador, localização ou experiência do usuário como pertencentes à Julia.`,
  `Consulte estes fatos antes de executar ferramentas. Se a resposta já estiver aqui, responda diretamente.`,
];

export const USER_FACTS_FOOTER_LINE = `Use the \`memory\` tool to save new facts about the user or search for more.`;

export function buildContextBlock(memories: RankedMemory[], budgetTokens: number): string {
  if (memories.length === 0 || budgetTokens <= 0) return '';

  const overheadTokens = estimateTokens([
    ...USER_FACTS_HEADER_LINES,
    '',
    USER_FACTS_FOOTER_LINE,
  ].join('\n'));
  let remaining = budgetTokens - overheadTokens;
  if (remaining <= 0) return '';

  const lines: string[] = [];
  for (const mem of memories) {
    const line = `- Fato do usuário [${mem.category}] **${mem.key}**: ${mem.content}`;
    const lineTokens = estimateTokens(line);
    if (lineTokens > remaining) continue;
    lines.push(line);
    remaining -= lineTokens;
  }

  if (lines.length === 0) return '';

  return [
    ...USER_FACTS_HEADER_LINES,
    ...lines,
    '',
    USER_FACTS_FOOTER_LINE,
  ].join('\n');
}
