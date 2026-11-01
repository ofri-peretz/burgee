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

**Closed 2026-11-01 by #1407.** The case is restored without `.skip`, as two cases: one after
`cmd` and one after `cmd x`. Two changes did it.

- **The measurement.** Each case times one parse of one adversarial input against a 1,000 ms
  budget, and carries a `timeout` of 5,000 ms. Ratios of two wall-clock times, divided or not
  by a linear reference, flaked on shared runners: #1407's run read 3.85 normalised on a linear
  `cutTrailingTabs`, against a ceiling of 3.
- **The code.** parse-command's bracket map is a `Uint8Array`. Before, it was a plain array
  filled from its last index down, which V8 holds as a sparse dictionary. `stripBrackets` now
  splits at the brackets instead of building a rope one character at a time. A cpu profile on
  `main` put those two lines and the collector at 69% of the time.
  - Each doubling of `cmd x` plus dots now costs 1.99–2.04x up to 5.12M characters. Before, it
    cost 2.1–2.5x past 1M (exponent 1.2–1.4).
  - `cmd x` plus 5.12M dots went from 461 ms to 134 ms.

| | before | after |
| :-- | :-- | :-- |
| CI | 24.05x and 25.42x at 8x the input, against 24: failed | see #1407's `Unit Tests (Turbo)` |
| `cmd` + 1,600,000 dots, local (node v24.12.0, macOS) | — | 6.8 ms best of 5; 18 ms in a vitest run |
| `cmd x` + 400,000 dots, local | — | 7.4 ms best of 5; 11 ms in a vitest run |
| the same two inputs, mutation dry run (oxmutate) | — | 18–34 ms and 11–16 ms |
| upstream's `parseCommand` on the same two inputs | — | did not finish in 12 s, so it fails the budget |
