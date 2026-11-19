# How much of a lane run is the dry run, 2026-11-18

Step 1 of [`dry-reuse.md`](../intents/oxmutate-fastest/dry-reuse.md) (roadmap `3.3`), whose stop
rule is: stop if the median dry-run share is under 25%.

**Median share: 46.9%** over nine runs, three each on `validator`, `paratext` and `oxmutate`.
That is over 25%, so the work goes on to step 2 (build).

## What was run

The oxmutate step of the changed-lines lane, the one the pre-push `mutation-changed` hook reaches
through `npm run mutation:changed` → `scripts/mutation-changed.sh` → `scripts/mutation.ts changed`.
A scratch driver called `runPackage` from `scripts/mutation.ts` with the lane's own options:
`PR_BUDGET` timeouts and budget, `engine: 'oxmutate'`, and the lane's concurrency formula (2, capped
at the cores the 1-minute load leaves free, never below 1). That gives the same wrapper Vitest
config, skipped tests, oxmutate config and `incremental` file as a push.

```ts
const specs = mutateSpecs(
  parseChangedLines(gitDiffU0(`${commit}^`, commit, `packages/${pkg}/`)),
  new Set([pkg]),
);
runPackage(pkg, specs.get(pkg), {
  concurrency,
  timeoutMS: PR_BUDGET.timeoutMS,
  dryRunTimeoutMinutes: PR_BUDGET.dryRunTimeoutMinutes,
  budgetMs: PR_BUDGET.wallClockMinutes * 60_000,
  engine: "oxmutate",
});
```

The change set for each package is the source lines of one recent merged pull request, so it is the
size of a real push:

| Package     | Pull request                          | Changed ranges | Mutants |
| :---------- | :------------------------------------ | -------------: | ------: |
| `validator` | #1623 (`7167140431`), 6 source files  |             16 |     139 |
| `paratext`  | #1610 (`965243c4d2`), 3 source files  |             12 |       5 |
| `oxmutate`  | #1588 (`8d16bf1235`), `quiescence.ts` |              6 |       8 |

Tree: `main` at `34d99125d5`, oxmutate 2.7.0, Node 24.12.0, 14 cores. Packages and oxmutate's native
core were built first, as the lane does. Before each run the 5-minute load average had to be under
30 and no root Vitest suite could be running.

## Where the numbers come from

oxmutate's clear-text summary already splits the run, so nothing was instrumented. Its first line
gives the whole run (`stats.wallMs`). Its timing line gives `dry run`, which is `stats.dryRunMs`:
the first dry run, timed around `dryRun()` in `coordinator.ts`. **Share = dry run / whole run.**

- The second dry run, which finds flaky tests, runs beside the warm phase and is not on the run's
  critical path, so it is not counted. Dry-run reuse would remove it too.
- `static.readers`' tracking dry run prints its own `static readers: … s` line. None of the nine
  runs started it, because no tracked source was loaded by more than one test file.
- The lane's own steps before oxmutate are not in the denominator: `git fetch`, the plan, the turbo
  build and the native build. They do not change with this work.

## The nine readings

Load is 1, 5 and 15 minutes, read at the start of the run.

| Run | Package     | Load at start      | Concurrency | Whole run | Dry run | Share |
| --: | :---------- | :----------------- | ----------: | --------: | ------: | ----: |
|   1 | `validator` | 17.9 · 29.8 · 41.6 |           1 |    18.2 s |   8.6 s | 47.3% |
|   1 | `paratext`  | 16.5 · 28.7 · 40.9 |           1 |    17.6 s |  12.5 s | 71.0% |
|   1 | `oxmutate`  | 16.5 · 27.9 · 40.4 |           1 |    95.1 s |  32.0 s | 33.6% |
|   2 | `validator` | 17.5 · 25.4 · 38.0 |           1 |    17.9 s |   8.4 s | 46.9% |
|   2 | `paratext`  | 18.3 · 25.1 · 37.6 |           1 |    12.9 s |   8.3 s | 64.3% |
|   2 | `oxmutate`  | 17.2 · 24.5 · 37.2 |           1 |   138.5 s |  29.1 s | 21.0% |
|   3 | `validator` | 11.5 · 18.5 · 32.0 |           2 |    10.6 s |   3.1 s | 29.2% |
|   3 | `paratext`  | 11.6 · 18.3 · 31.7 |           2 |     3.9 s |   2.5 s | 64.1% |
|   3 | `oxmutate`  | 11.7 · 18.1 · 31.6 |           2 |   103.4 s |  11.6 s | 11.2% |

Every run passed: every mutant was killed, none survived. Each `oxmutate` run restarted one polluted
context, and rounds 2 and 3 spent 47.4 s and 29.7 s in isolated runs.

| Package      | Median share | Range         |
| :----------- | -----------: | :------------ |
| `validator`  |        46.9% | 29.2% – 47.3% |
| `paratext`   |        64.3% | 64.1% – 71.0% |
| `oxmutate`   |        21.0% | 11.2% – 33.6% |
| **All nine** |    **46.9%** | 11.2% – 71.0% |

## What it says

- **The share depends on the mutant count, not on the package size.** `paratext` has 5 mutants and
  is mostly dry run. `oxmutate` has 8 mutants but a slow suite per mutant (62 s of mutant phase in
  every run), so its dry run is the smaller part.
- **Load moves the dry run more than the mutant phase.** From round 2 to round 3, the 1-minute load
  fell from about 18 to about 11.5 and concurrency went from 1 to 2. `validator`'s dry run fell
  from 8.4 s to 3.1 s and `oxmutate`'s from 29.1 s to 11.6 s, while `oxmutate`'s mutant phase
  stayed at 62 s. One reading at one load is not enough. This is why `dry-reuse.md`'s
  `validator` reading (2.8 s of 23 s, 12%) and these differ.
- **Every one of these runs was a cold run.** `runPackage` writes the incremental file inside
  `packages/<pkg>/.mutation/` and deletes that folder when the run ends, so no run reused a verdict.
  With `3.2`'s verdict reuse working on a second push, the mutant phase would shrink and the dry run
  would be a larger share than measured here. So 46.9% is a floor for a repeat push, not a ceiling.
  That lifecycle is a separate defect, raised outside this note.

## Verdict

The median, 46.9%, is over the 25% stop line. **Step 2 (build) is next**, as `dry-reuse.md` orders
it.
