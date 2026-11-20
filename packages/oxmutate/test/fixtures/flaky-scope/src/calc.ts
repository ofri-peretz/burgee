// Killed by steady.spec.ts; the flaky test calls it too, and checks nothing about it.
export function add(a: number, b: number): number {
  return a + b;
}

// Killed only by the flaky test.
export function sub(a: number, b: number): number {
  return a - b;
}

// Reached on every other run of the flaky test: its coverage differs between the two dry runs.
export function tick(n: number): number {
  return n * 2;
}
