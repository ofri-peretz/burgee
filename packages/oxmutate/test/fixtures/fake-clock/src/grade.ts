/** A grade for a score. Every mutant here is caught at once: none of them runs away. */
export function grade(score: number): string {
  // Inside the function, not at module level: a module constant's mutants are static, and each
  // would cost an isolated run this fixture does not need.
  const aFrom = 90;
  const bFrom = 75;
  if (score >= aFrom) return 'A';
  if (score >= bFrom) return 'B';
  return 'C';
}
