// A memo, as pathe's glob cache is: once a run has computed a value, a later run reads it back and never
// reaches the code that computed it. A mutant in that code, armed after any other run in the same
// worker, is served the memo and survives; armed first, on a cold memo, it is killed. Its verdict then
// depended on its place in its unit. Each mutant of triple()'s body must read Killed wherever it sits.
const cache = new Map<number, number>();

export function triple(n: number): number {
  const hit = cache.get(n);
  if (hit !== undefined) return hit;
  const value = n * 3 + 1; // eslint-disable-line conventions/no-magic-numbers -- the literal is what the fixture mutates
  cache.set(n, value);
  return value;
}
