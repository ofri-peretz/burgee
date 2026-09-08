/**
 * The module-load spy the lock reads: every lazily loaded handler module records itself
 * here on import, so a test can assert that `--help` and `--schema` imported none of them
 * and that one command imported exactly one (M2).
 */
export const loaded: string[] = [];

export function loads(): string[] {
  return [...loaded];
}

export function reset(): void {
  loaded.length = 0;
}
