// Module state a failing mutant leaves behind (oxmutate-x2, pollution recovered in the worker). Nothing
// asserts on reset(), so on clean state its mutants survive; a mutant that empties it leaves entries
// that fail the next run, and the worker must judge the mutants after it from a clean module registry,
// as a new worker does: reset()'s and spare()'s mutants all survive there.
const entries: string[] = [];

export function add(name: string): void {
  entries.push(name);
}

export function list(): string[] {
  return [...entries];
}

export function reset(): void {
  entries.length = 0;
}

// Only the second test runs this, and it starts from empty: a worker that ran it on the first
// collection's polluted modules would fail it for every mutant, spare()'s included. Its first mutant
// stands without a canary, so that one is decided on whichever modules the test runs from.
export const spare = (): number => 1 + 1;
