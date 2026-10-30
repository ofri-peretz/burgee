// Import-time values: every mutant here is static, decided only by re-evaluating the module.
const MAX = 3;
const LABEL = 'items';
// Never read by a test: its mutants survive.
export const UNUSED = 'spare';

export function clamp(n: number): number {
  return Math.min(n, MAX);
}

export function describe(n: number): string {
  return `${String(clamp(n))} ${LABEL}`;
}
