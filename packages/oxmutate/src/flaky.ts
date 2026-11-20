/** What a flaky re-run decision reads of a mutant (coordinator.ts `MutantResult` has all of it). */
export interface Reran {
  status: string;
  coveredBy: string[];
  killedBy?: string[] | undefined;
}

/**
 * The mutants a flaky test could have decided, which step 7 re-runs: every one a flaky test covers,
 * except a Killed one with a killer the flakiness cannot reach. Such a killer is a test that is not
 * flaky (the same state and coverage across two dry runs) and shares its file with no flaky test:
 * Vitest gives each test file a context of its own, so only a test of the same file, run before it
 * and leaving state behind, could have made its failure depend on chance. Its re-run fails the same
 * way, and a re-run only ever marks a verdict `flaky`, so it cannot change one. On unjs/pathe 416 of
 * 786 isolated runs were flaky re-runs, for one slow test (2026-11-19). Still re-run: survivors,
 * Timeouts (a stop is a time, which a slow neighbour moves), and kills whose killers are all flaky,
 * share a file with a flaky test, or are not tests (a file id, when a hook or the import failed).
 */
export function flakyCandidates<M extends Reran>(
  mutants: readonly M[],
  flakyTests: ReadonlySet<string>,
  fileOf: (test: string) => string | undefined,
): M[] {
  // Stryker disable next-line ConditionalExpression: with no flaky test the filter below finds none too; the early return only skips building `touched`
  if (flakyTests.size === 0) return [];
  const touched = new Set([...flakyTests].map(fileOf));
  const steady = (test: string): boolean => {
    const file = fileOf(test);
    return file !== undefined && !flakyTests.has(test) && !touched.has(file);
  };
  return mutants.filter(
    (m) =>
      m.coveredBy.some((t) => flakyTests.has(t)) &&
      // Stryker disable next-line ArrayDeclaration: any one-element list names a test `fileOf` does not know, which is not steady, as `[]` is not
      !(m.status === 'Killed' && (m.killedBy ?? []).some(steady)),
  );
}
