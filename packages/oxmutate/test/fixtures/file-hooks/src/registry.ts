// The registry fixture, with the cleanup moved where test suites usually keep it: a file-level
// `beforeEach`. A mutant that leaves entries behind is wiped by that hook before the next run.
const items: string[] = [];

export function register(name: string): void {
  if (!items.includes(name)) items.push(name);
}

export function list(): string[] {
  return [...items];
}

export function reset(): void {
  items.length = 0;
}
