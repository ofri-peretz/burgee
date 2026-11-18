# Design note — roadmap `3.3`: keep the dry run's results between runs

Intent: [`intent.md`](./intent.md) · Roadmap: [`roadmap.md`](./roadmap.md) · **Written:**
2026-11-18, by the session building `oxmutate-fastest`. **Status: accepted** ([`D-20261118-oxmutate-dry-reuse-design-accepted`](../../decisions/D-20261118-oxmutate-dry-reuse-design-accepted.md)). It
changes which tests' coverage a run trusts, so it needs the owner's acceptance before any of it is
built (`AI_NATIVE_SDLC.md`, Design → Build).

## The cost it goes after

Every run starts with a dry run of the whole suite, with no mutant armed. It finds which tests reach
which mutant, how long each test takes, and the module graph of each test file. It runs even when
the incremental cache (`3.2`) reuses every verdict, because the cache's fingerprint is built from
the graph the dry run reports.

What it costs varies with the package. Two readings from the changed-lines lane on 2026-11-18:

| Package                                |                      Dry run | Whole run |     Share |
| :------------------------------------- | ---------------------------: | --------: | --------: |
| `validator`, 16 changed ranges         |                        2.8 s |      23 s |       12% |
| `oxmutate`, 9 changed ranges, load 170 | over 240 s (the run stopped) |         — | all of it |

The roadmap's "half of a small run" came from one package on 2026-11-12. **Step 1 below measures it
on three packages before anything is built.**

## The proposal

Keep each test file's dry-run results in the incremental file (`.mutation/oxmutate-incremental.json`
in the lane), keyed by what they depend on, and run only the files whose key changed.

- **The key of a test file** hashes, in order:
  - oxmutate's version, Node's, the lockfile and the options, as the verdict fingerprint already does;
  - the Vitest config file and `package.json`;
  - the test file;
  - every module in its graph from the last dry run, each with its content hash and the ids of the
    mutants instrumented in it this run.

  A source edit changes its hash. A change to the mutated ranges changes its mutant ids. Either way,
  every test file that loads that source runs again.

- **What is kept per file:** its tests (id, name, state, ms), their per-test coverage, its
  file-collection coverage (`file:<path>`), its module graph, whether it is a `runOnce` file, and
  its flaky tests.
- **What runs:** a dry run over the files whose key changed, plus new files. `child.ts` runs
  `globTestSpecifications()` minus the kept files, through `runTestSpecifications`. With nothing
  left, no server starts.
- **What is merged:** kept and fresh results, as one dry run would have reported them. The flaky
  check's second run, and `static.readers`' tracking run, cover only the fresh files. Their kept
  results come from the file.

## What can make it wrong, and the guard for each

| Risk                                                                                                           | Guard                                                                                                                                                                                   |
| :------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A test reads something outside its module graph (a fixture through `fs`, an environment variable) that changed | 1 kept file in 20 runs anyway (the `3.2` audit share). If its tests or coverage differ from what was kept, the whole dry run is repeated and the file is rebuilt; the summary counts it |
| Coverage with no test current (`static` hits from setup files) cannot be split by file                         | Any such hit in the kept run turns reuse off for that run                                                                                                                               |
| `isolate: false` shares module state between files                                                             | oxmutate already forces `isolate: true` (`child.ts`)                                                                                                                                    |
| A deleted or renamed test file                                                                                 | Its key reads the file as missing, so it is never kept                                                                                                                                  |
| A failing test hidden by a kept result                                                                         | A file is kept only from a run where all its tests passed. Its key changes when the file or anything it loads changes                                                                   |

## Order of work

1. **Measure:** dry-run share of the lane run on `validator`, `paratext` and `oxmutate`, three pushes
   each. Stop here if the median share is under 25%.
2. **Build it** behind `incremental`, with no new option. Fixtures:
   - a kept file must run again after its source, its test, its mutated ranges, or the config
     change;
   - a changed fixture read through `fs` must be caught by the audit;
   - each fixture must fail without its guard.
3. **A/B:** `bench/ab.mjs` against main, every verdict equal, on three packages.

## What it does not do

- It does not keep verdicts. That is `3.2`, and its fingerprint is unchanged.
- It shares nothing between machines (out by the owner's rule).
- It adds no setting. It is part of `incremental`, and a run without `--incremental` is as before.
