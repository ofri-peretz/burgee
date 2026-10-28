// A registry whose test does not clean up when it fails: a mutant that fails the test leaves
// entries behind, and every later mutant in that context would be judged against them.
const items: string[] = [];

export function register(name: string): void {
  if (!items.includes(name)) items.push(name);
}

export function list(): string[] {
  return [...items];
}

// Nothing asserts on reset(), so its mutants survive: unless leftover entries kill them.
export function reset(): void {
  items.length = 0;
}
