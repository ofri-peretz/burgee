// A fixture builder only `beforeEach` calls: its mutants are reached through the hook, never the test body.
export function seed(): string[] {
  return ['alpha', 'beta'];
}
