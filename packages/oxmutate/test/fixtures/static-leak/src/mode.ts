// The first evaluation wins: `??=` keeps whatever an earlier evaluation in the same process set.
// A fresh worker per mutant sees only its own value; a live worker re-evaluating per mutant would
// see the first one, so a mutant that changes MODE would survive there and be killed here.
const MODE = 'strict';
(globalThis as { __fixtureMode?: string }).__fixtureMode ??= MODE;

export function mode(): string | undefined {
  return (globalThis as { __fixtureMode?: string }).__fixtureMode;
}
