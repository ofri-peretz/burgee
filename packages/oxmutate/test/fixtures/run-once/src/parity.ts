// Pure: no mutant can leave state behind, so a failed canary here is never pollution.
export function parity(n: number): string {
  if (n % 2 === 0) return 'even';
  return 'odd';
}

export function sign(n: number): string {
  if (n > 0) return 'positive';
  if (n < 0) return 'negative';
  return 'zero';
}

// Only the RuleTester-shaped block in mixed.spec.ts covers it.
export function isOdd(n: number): boolean {
  return n % 2 !== 0;
}
