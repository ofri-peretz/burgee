// A running total whose test cleans up in `finally`. reset() mutated to do nothing leaves the total
// behind while its test passes; the next mutant's run fails on it, and its own `finally` cleans up,
// so a canary after both passes. That next mutant does nothing the test checks: Survived on clean state.
let sum = 0;

// Killed before the test touches state, so the canary interval doubles ahead of reset().
export function label(): string {
  return 'counter';
}

export function unit(): string {
  return 'points';
}

export function reset(): void {
  sum = 0;
}

export function spare(): number {
  return 1 + 1;
}

export function add(n: number): void {
  sum += n;
}

export function total(): number {
  return sum;
}
