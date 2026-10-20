---
id: A-20261019-burgee-dist-strays-unreproduced
section: A
status: open
source: 'a local burgee run reported ~43 stray files in packages/burgee/dist on 2026-10-19, failing check:artifacts and declaration-reach; vitest-dist-guard.ts'
done_when: 'the run or command that writes into packages/burgee/dist is named, pointed at a scratch directory, and a check that fails on it is proven red first'
---

**Something left about 43 files in `packages/burgee/dist` that no source produces, and the writer
is not named yet.** It was reported on 2026-10-19 from a warm worktree. `check:artifacts` and
`declaration-reach` then failed locally on files nobody would publish.

It did not reproduce. On a clean build of `9930e086`, the file list of every package's `dist/`
was taken before and after each of these runs, and all four left it unchanged:

- burgee's own `vitest run`: 118 files, 1,731 tests.
- burgee's `vitest run --coverage.enabled`.
- The root suite (`vitest.root.config.ts`): 125 files, 3,016 tests.
- `turbo run test` over every workspace: 52 tasks.

No burgee test writes under `dist/` by path either. Each reads `dist/cli.js`,
`dist/shutdown.js` or a façade, and writes to a scratch project of its own.

The likeliest writer is not a test at all. `tsc` never deletes an output whose source has gone,
and a turbo cache hit restores outputs on top of what is there. So a warm worktree switched
between branches keeps the other branch's `dist/` files. `scripts/weight-converge.mjs` records the
same failure on closeout (5.7 KB from another branch's build), which is why it clears every
`dist/` first.

**What is in place.** `vitest-dist-guard.ts` is burgee's `globalSetup`. It lists `dist/` before
the first test file and after the last, and fails the run naming every file added, removed or
rewritten (`scripts/vitest-dist-guard.test.ts`). If a test is the writer, the next run says which
file it wrote.

**Done when** the writer is named. If it is a test, its write goes to `scripts/scratch-dir.ts`. If
it is branch residue, the build clears `dist/` before `tsc` runs, and the cache-restore path is
measured. Either way, a check is proven to fail on the unfixed state first.
