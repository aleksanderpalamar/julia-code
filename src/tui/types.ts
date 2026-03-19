export type AgentMode = 'normal' | 'plan' | 'accept-edits';

export const WRITE_TOOLS = ['write', 'edit', 'exec'];

export function nextMode(current: AgentMode): AgentMode {
  switch (current) {
    case 'normal': return 'plan';
    case 'plan': return 'accept-edits';
    case 'accept-edits': return 'normal';
  }
}

export function modeLabel(mode: AgentMode): string {
  switch (mode) {
    case 'normal': return '';
    case 'plan': return 'plan mode';
    case 'accept-edits': return 'accept edits';
  }
}

export function modeColor(mode: AgentMode): string {
  switch (mode) {
    case 'normal': return 'green';
    case 'plan': return 'blue';
    case 'accept-edits': return 'red';
  }
}

export type Temperament = 'neutral' | 'sharp' | 'warm' | 'auto';

export function nextTemperament(current: Temperament): Temperament {
  const order: Temperament[] = ['neutral', 'sharp', 'warm', 'auto'];
  return order[(order.indexOf(current) + 1) % order.length];
}

export function temperamentLabel(t: Temperament): string {
  switch (t) {
    case 'neutral': return '';
    case 'sharp': return '⚡ sharp';
    case 'warm': return '☀ warm';
    case 'auto': return '🔄 auto';
  }
}

export function temperamentColor(t: Temperament): string {
  switch (t) {
    case 'neutral': return 'gray';
    case 'sharp': return 'red';
    case 'warm': return 'yellow';
    case 'auto': return 'magenta';
  }
}
