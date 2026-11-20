// Stryker disable next-line all: module state; a mutant here would be static, and this fixture is about survivors
const items: string[] = [];
// Stryker disable next-line all: module state; a mutant here would be static, and this fixture is about survivors
let touches = 0;

export function add(item: string): void {
  items.push(item);
}

export function has(item: string): boolean {
  return items.includes(item);
}

export function count(): number {
  return items.length;
}

// Emptied, reset() leaves the first test's item for the second, which expects an empty store. Each
// test passes alone, so the warm run keeps it; only a run armed across the file kills it (6b).
export function reset(): void {
  items.length = 0;
}

// Never read by a test: its mutants survive every run that executes only covering tests.
export function touch(): void {
  touches += 1;
}
