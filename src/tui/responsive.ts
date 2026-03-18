export type Breakpoint = 'wide' | 'medium' | 'narrow';

export function getBreakpoint(columns: number): Breakpoint {
  if (columns >= 120) return 'wide';
  if (columns >= 80) return 'medium';
  return 'narrow';
}
