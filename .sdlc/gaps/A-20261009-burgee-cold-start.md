---
id: A-20261009-burgee-cold-start
section: A
status: open
source: 'B2, published measurement 2026-10-08 (#893)'
done_when: 'the CI series reads burgee ÷ cac at or below 1.35 and burgee/commander ÷ commander at or below 1.10 for five consecutive runs on main, with a start-up guard that fails on the regression'
---

burgee's cold start regressed between the two published measurements on the same runner
class:
- `burgee ÷ cac`: 1.322 on 2026-09-09, 1.559 on 2026-10-08. Every CI run since 2026-10-06
  reads between 1.47 and 1.56.
- `burgee/commander ÷ commander`: 1.078 to 1.175, so the drop-in is no longer level with
  commander.
- burgee's full run over bare node: +14.0 ms to +20.3 ms.

The 1.6 ratchet still holds, and `comparison.mdx` now states the regression.

**What it is: the module count.** `perf/burgee-cold-start` traced every module the B2 fixtures
load with a `module.registerHooks` load hook. `burgee.mjs` loaded 13 modules on 2026-09-09
and 27 at fc8c862, for 2.5 KB more source. Interleaved A/B spawns read each child's own CPU
time, which on the dev machine tracks CI's ratio to 0.03: 1.310 for the 09-09 build and 1.590
for main, against CI's 1.322 and 1.559. The steps, each a family-composition decision and none
a decision about start-up:

- `0750ebc`: precedence from `seniority`, +2 at the time.
- `3ea38c3`: E5/O5 through `closeout`'s barrel, +8. This is about 4.1 ms of the 6.2. Loading
  its eight files is 2.7 ms of that; `install()` and the run are 0.45 ms.
- `08976ae`: `ctx.interactive` from `roundel/terminal`, +2 on dispatch, about 0.75 ms.
- `61c51f9`: `burgee/commander` 16 to 24 modules through `bellpull/cross-spawn`, about 4 ms.
  Loading it lazily recovers all of that, but `parse()` is synchronous (D-102), and a
  `createRequire` of a family package would hide it from a bundler. So it stays.

**Taken in that branch.** The engine stopped building the `node:util` and `node:fs`
namespaces, which was 24 Node internals per run. The CPU ratio went 1.590 to 1.517, and
`benchmarks/cold-start-modules.test.ts` now locks both fixtures' start-up module lists. The
ratchet stays at 1.6 until CI reads the new build: `claim-table-lock` refuses a ceiling below
the newest CI observation (1.559).

**What is left is structural.** Each ES module costs 0.2 to 0.4 ms of CPU, whatever its size.
Folding closeout's `deadline` and `report` into `registry` was simulated at 0.5 to 0.7 ms.
Reaching 1.35 needs fewer files on the path, for example one bundled file per published
entry with shared chunks. That is a build decision for every package, not a fix inside one.
