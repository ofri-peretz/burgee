// What a registry reset does not clear: the worker's globals. configure()'s condition mutated to
// `true` fills memo()'s memo on globalThis, which no canary of the first test looks at, and a later
// reset() mutant leaves the module's entries behind, which the canary does see. A worker that
// recovers keeps the memo, so memo()'s mutants, which the second test kills on the cold memo a new
// worker has, are hidden by the warm one and survive. Recovering must compare globalThis with what
// the file found, and restart when it differs.
type Memo = { __fixtureMemo?: number };
const entries: string[] = [];

export function add(name: string): void {
  entries.push(name);
}

export function list(): string[] {
  return [...entries];
}

export function configure(loud: boolean): void {
  if (loud) (globalThis as Memo).__fixtureMemo = 6;
}

// One mutant is live here, the literal: on the cold memo a new worker has it is killed, on a warm one
// it is hidden. The lines around it are off, so no other mutant of memo() is decided beside it.
export function memo(): number {
  // Stryker disable next-line all: only the literal is under test
  const hit = (globalThis as Memo).__fixtureMemo;
  // Stryker disable next-line all: only the literal is under test
  if (hit !== undefined) return hit;
  const value = 6;
  // Stryker disable next-line all: only the literal is under test
  (globalThis as Memo).__fixtureMemo = value;
  return value;
}

// Nothing asserts on it: on clean state its mutants survive.
export function reset(): void {
  entries.length = 0;
}
