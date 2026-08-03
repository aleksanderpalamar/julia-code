/**
 * Builds the system message we inject after a turn where the model announced
 * a tool-flavored action but emitted no `tool_call`. The message is deliberately
 * static: assistant output can contain untrusted user or tool content and must
 * never be promoted into a system-level instruction.
 */
export function buildIntentNudge(): string {
  return [
    '[intent-without-action]',
    'A resposta anterior anunciou uma ação, mas não emitiu nenhuma tool_call.',
    'Se ainda quer realizar a ação, chame a ferramenta apropriada agora.',
    'Se não precisa de ferramentas para responder, responda diretamente sem prometer ações.',
  ].join(' ');
}
