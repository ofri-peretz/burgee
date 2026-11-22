// A memo again (see memo-hides), with a guard on the cold path that takes the process down. The guard's
// condition mutated to `true` does it on a cold memo: warm, the memo answers first and the mutant
// survives; in a fresh worker it kills the worker, and a worker that dies under a mutant is that
// mutant's RuntimeError, wherever it sits in its unit.
const cache = new Map<number, number>();

export function triple(n: number): number {
  // Stryker disable next-line all: only the guard below is under test
  const hit = cache.get(n);
  // Stryker disable next-line all: only the guard below is under test
  if (hit !== undefined) return hit;
  // Stryker disable next-line all: only the guard below is under test
  const value = n * 3; // eslint-disable-line conventions/no-magic-numbers -- the literal is what the fixture mutates
  if (Number.isNaN(value)) process.kill(process.pid, 'SIGKILL');
  // Stryker disable next-line all: only the guard below is under test
  cache.set(n, value);
  return value;
}
