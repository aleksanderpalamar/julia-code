export function needsToolCalling(text: string): boolean {
  const lower = text.toLowerCase();

  const refusalIndicators = [
    'não consigo acessar', 'não consigo executar', 'não consigo rodar',
    'não tenho acesso', 'não posso executar', 'não posso rodar',
    'não posso ler', 'não consigo ler', 'não consigo listar',
    'não tenho capacidade', 'não consigo verificar', 'não tenho como',
    'não posso acessar', 'sem acesso ao', 'sem acesso a ',
    'não consigo criar', 'não consigo escrever', 'não posso criar',
    'você pode executar', 'execute o comando', 'rode o comando',
    'tente rodar', 'você pode rodar', 'você pode usar o comando',
    'i cannot access', 'i cannot execute', 'i cannot read', 'i cannot run',
    'i don\'t have access', 'i can\'t access', 'i can\'t read',
    'i can\'t execute', 'i can\'t run', 'i can\'t list',
    'i can\'t create', 'i can\'t write',
    'you can run', 'try running', 'you could run',
    'unable to execute', 'unable to run', 'unable to access',
  ];
  if (refusalIndicators.some(i => lower.includes(i))) return true;

  const shellPatterns = [
    /^\s*(?:cat|ls|cd|grep|find|echo|pwd|whoami|uname|head|tail|wc|mkdir|rm|cp|mv|chmod|curl|wget|pip|npm|git|python|node|docker)\s+\S/m,
    /^\s*\$\s+\w+/m,
    /```(?:bash|sh|shell|terminal|console|zsh)\n/i,
  ];
  if (shellPatterns.some(p => p.test(text))) return true;

  const intentIndicators = [
    'vou verificar', 'vou checar', 'deixa eu ver', 'deixe-me verificar',
    'vou executar', 'vou rodar', 'vou ler o arquivo', 'vou listar',
    'vou acessar', 'vou consultar', 'vou buscar',
    'let me check', 'let me verify', 'let me run', 'let me read',
    'let me look', 'let me see', 'i\'ll check', 'i\'ll run',
    'i\'ll read', 'i\'ll look',
  ];
  if (intentIndicators.some(i => lower.includes(i))) return true;

  return false;
}
