// Read while the module loads: a static mutant, which a live worker runs with every test of the files that load it.
export const LIMIT = 100;

export function add(a: number, b: number): number {
  return a + b;
}

export function clamp(n: number): number {
  return n > LIMIT ? LIMIT : n;
}
