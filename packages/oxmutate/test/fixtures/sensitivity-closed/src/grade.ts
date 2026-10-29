// SC5's module, byte-identical in sensitivity-weak/ and sensitivity-closed/: only the suites differ.
// The weak suite misses two behaviours: the boundary at 90, and the grade below it.
const A_FROM = 90;

export function grade(score: number): string {
  if (score >= A_FROM) return 'A';
  return 'B';
}
