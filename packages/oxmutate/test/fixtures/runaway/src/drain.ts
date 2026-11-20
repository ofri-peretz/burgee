// One mutant here (the step's `1`) makes `drain` loop for ever, and the switch it hangs on is read
// once, before the loop: no hit count can stop it, only the watchdog (the hit limit counts reads).
export function drain(from: number): number {
  const step = 1;
  let left = from;
  while (left > 0) left -= step;
  return left;
}
