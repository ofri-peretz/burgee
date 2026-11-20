// State that a registry reset does not reach and no snapshot of the globals can tell: an object that
// already existed when the file was collected, changed in place. The unmutated test sees it, so a
// worker that recovered and ran that test on the new collection would find it fail, and must restart.
// Without that check the leftovers of one reset() mutant kill the next, which survives in a new worker.
const items = ((globalThis as { __fixtureShelf?: string[] }).__fixtureShelf ??= []);

export function add(name: string): void {
  items.push(name);
}

export function list(): string[] {
  return [...items];
}

// Nothing asserts on it: on clean state its mutants survive.
export function reset(): void {
  items.length = 0;
}
