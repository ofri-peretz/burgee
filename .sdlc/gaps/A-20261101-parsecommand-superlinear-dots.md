---
id: A-20261101-parsecommand-superlinear-dots
section: A
status: closed
source: 'packages/burgee/src/yargs/utils.test.ts › "strips brackets after a run of dots in linear time", red on CI from #1373 on (runs 41297420986 and 41299017646)'
done_when: 'the case is restored without .skip, holds on CI runners, and finishes in well under 5 s; a quadratic parseCommand still fails it'
---

On CI the growth case failed at a ratio above its ceiling of 24, inside the required
`Quality (Full) Gate` on every pull request:

- 8x the input took 24.05x the time (61.7 ms → 1,483.5 ms);
- 8x the input took 25.42x the time (17.0 ms → 431.9 ms).

Locally it is linear. Best of 5, `cmd x` plus 50,000 dots takes 4.0 ms, and plus 400,000 dots takes
28.2 ms, so 8x the input takes 7x the time. The CI ratio therefore points at the measurement, not
yet at the algorithm. The likely causes are allocation and GC pressure: inputs of up to 800,000
characters, iterated one character at a time on a 2-core runner. The test calibrates its inputs up
to sizes where one case runs for seconds. The owner's rule (2026-11-01) is that no single test case
takes more than 5 seconds.

The case is skipped (`it.skip`, naming this gap) to unblock `main`. The other `parseCommand`
growth cases stay on.

**To close.** Restore the case in a form that holds on CI and finishes in well under 5 s. Use small
inputs. Compare the time against a linear reference over the same input, so runner speed cancels
out. Make parseCommand allocation-light if the GC is the cause. The restored case must still fail
on a quadratic parseCommand.

**Closed 2026-11-01 by #1407.** The case is restored without `.skip`. It now runs as two cases,
one after `cmd` and one after `cmd x`. Both the measurement and the code changed.

- **The measurement.** `growth()` divides the parse's growth over 8x the input by a linear
  character scan's growth over the same two inputs. Linear code reads about 1 and quadratic about
  8, against a ceiling of 3. Each 8x input is at most 200k characters. The call repeats rather
  than the input growing, and each case carries a 5,000 ms timeout.
- **The code.** parse-command's bracket map is a `Uint8Array`, where it was a plain array that V8
  held as a sparse dictionary. `stripBrackets` splits at the brackets instead of building a rope.
  A cpu profile on main put those two lines and the collector at 69% of the time. Each doubling
  of `cmd x` + dots now costs 1.99–2.04x up to 5.12M, where it was 2.1–2.5x past 1M
  (exponent 1.2–1.4).

| | before | after |
| :-- | :-- | :-- |
| CI ratio, `cmd x` + dots | 24.05x and 25.42x at 8x the input, against 24 | passes the normalised ceiling of 3 |
| local, normalised, 20 runs under load 41–54 | — | 0.74–1.18 (`cmd`), 0.78–1.05 (`cmd x`) |
| CI case duration, `Unit Tests (Turbo)` on ubuntu | 7,650 ms, failed (#1404) | 1,382 / 702 ms on #1407's first helper; 288–363 / 286–759 ms locally with the final one |
| quadratic stand-in (`upstreamParseCommand`) | — | 7.36 normalised (`cmd`) and over 5 s (`cmd x`): fails |
