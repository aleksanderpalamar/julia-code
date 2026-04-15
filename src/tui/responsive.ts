export type Breakpoint = 'wide' | 'medium' | 'narrow';

export function getBreakpoint(columns: number): Breakpoint {
  if (columns >= 90) return 'wide';
  if (columns >= 70) return 'medium';
  return 'narrow';
}
