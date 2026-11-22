// Module state a failing mutant leaves behind, in a test that mocks process.cwd and never puts it back
// (pathe's tests do, and 24 of its 116 pollution events threw looking for Vitest at the empty path).
// The worker must still recover in place.
const entries: string[] = [];

export function add(name: string): void {
  entries.push(name);
}

export function list(): string[] {
  return [...entries];
}

// Nothing asserts on it: on clean state its mutants survive.
export function reset(): void {
  entries.length = 0;
}
