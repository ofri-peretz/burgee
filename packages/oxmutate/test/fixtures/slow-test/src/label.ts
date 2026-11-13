// Import-time values: both mutants are static.
const SUFFIX = 'items';
// Never read by a test: its mutant survives, however slow the suite is.
export const UNUSED = 'spare';

export function label(n: number): string {
  return `${String(n)} ${SUFFIX}`;
}
