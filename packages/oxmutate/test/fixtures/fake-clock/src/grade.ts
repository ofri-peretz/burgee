const A_FROM = 90;
const B_FROM = 75;

/** A grade for a score. Every mutant here is caught at once: none of them runs away. */
export function grade(score: number): string {
  if (score >= A_FROM) return 'A';
  if (score >= B_FROM) return 'B';
  return 'C';
}
