---
id: D-20261027-windows-lane-one-shell-per-file
subject: 'windows-lane-holds criterion 2: what makes `changeset-check-lock` and controlroom''s Ink case cheap on Windows without dropping an assertion, and does R4 still describe where `changeset-check-lock` spends its time?'
taken: 'Taken under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-27'
date: '2026-10-27'
superseded_by: —
---

**`changeset-check-lock` starts the step's shell once per file. One driver `bash`, spawned from
Node in the file's `beforeAll`, runs the step's own script for every scenario, each as its own
`bash -x` in a subshell with only its own variables and its own `$GITHUB_OUTPUT`. The cases read
the answers. controlroom's Ink case packs its three peers with one `npm pack` instead of three.
No timeout rises and no assertion is dropped. The Dependabot block's 120 s budget is removed, as
its own comment said it would be once the report showed it under half of 30 s.**

## R4's premise no longer describes the cost

R4 moved the repository build out of the cases. The build is no longer what is slow. From the
`vitest-durations` artifacts of ten full Windows cells on `main` (runs 40273043615 to 40513685943)
and the failed cell of run 40537347822 (job 122312824854):

| case, in file order | what it spawns from Node | duration over the ten cells | run 40537347822 |
| :-- | :-- | :-- | --: |
| answers `release` | one `bash`, which returns before any git | 3,166–8,519 ms | 65,871 ms (timeout 30,000) |
| answers `skipped` | one `bash`, same | 913–2,135 ms | 5,926 ms |
| the four Dependabot cases | one `bash`, which runs git five times and `node` once | 194–850 ms | 313–931 ms |

The cheapest case is the slow one. What costs is the first `bash` the file starts from Node, then
the second. A `bash` that runs five processes of its own takes under a second. On macOS each case
takes 15 ms. In the failed cell the file ran from 16:24:02 to 16:25:22 while
`readme-quick-start-lock` and `independence-install-lock`, two `npm install` files, ran beside it
for 137 s each. A cold start from Node pays for that load. A process that bash starts is not a
cold start in that sense.

The cause of the cold-start cost on the runner is not measured. Defender scanning the MSYS
runtime on first load, and the runtime's start-up when its parent is not an MSYS process, both
fit. Neither is needed for the fix: the file now pays for one cold start, not six.

## Where the cost goes

The single cold start now runs in `beforeAll`, under the 120 s budget R4 already gave that hook.
`scripts/vitest-durations-reporter.ts` times cases, not hooks, so criterion 2 does not see it.
That is a smaller cost in a place the check does not measure, not a cost removed. It is said here
so the next reader does not take a quiet report as proof that the cell got lighter. If the hook
ever needs more than 120 s, the file fails, as it should.

## Measured on this machine

M-series Mac, load average 33–51 during the runs:

| | before | after |
| :-- | --: | --: |
| `changeset-check-lock`, whole file, three runs | 838–1,160 ms | 885–966 ms |
| its slowest case | 221 ms | 1 ms |
| controlroom's Ink case, three runs, alternated with the old file | 3,052–3,483 ms | 2,307–2,377 ms |
| three `npm pack`s against one with three folders, two runs | 2,039 and 2,339 ms | 782 and 786 ms |

The Windows numbers come from the PR's own Windows cell and from `main`'s next ten.

## Still catches what it locks

Each defect below, written into the step by hand, was run against the new file and the old one.
Both failed the same case: no release guard (`release`), no skip-label guard (`skipped`), the
exemption for any author (the person case), no exemption at all (`dev-dependencies`), an exemption
that ignores runtime dependencies (the runtime case). One edit passes both files: dropping the
`case` that rejects a file other than a manifest. A file under `src/` that is not JSON still fails
the step's `JSON.parse`, and that alone sets `dev_only=false`. That gap was there before this
change. For the Ink case, a `renderToString` that ignores `columns` fails it.

## Rejected

- **Answering the guard cases in-process.** It would mean matching the step's text instead of
  running it, which is the defect the file's header says it was written to catch.
- **A warm-up spawn in `beforeAll` with the cases unchanged.** The six cold spawns would still
  happen. Only the first would move.
- **A higher timeout for the first case.** Refused by D-20261012-windows-lane-fix-the-case.
