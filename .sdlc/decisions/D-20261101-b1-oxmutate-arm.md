---
id: D-20261101-b1-oxmutate-arm
subject: 'first-adopter A5: how does B1 run against oxmutate, the real CLI, when oxmutate may not run in GitHub Actions? Which tasks, how many runs, what threshold, what spend?'
taken: 'Taken 2026-11-01 by the agent closing A5 under the owner''s delegation (burgee-owner-delegates-tradeoffs). The spend is quoted below, before any run'
date: '2026-11-01'
superseded_by: —
---

**B1 gains an oxmutate arm: its own four tasks, a shim named `oxmutate`, run on the owner's
machine with `npm run bench -- --axis agent --arm oxmutate`, never in GitHub Actions. A5 is
graded on three local readings, reported as their median and range. A reading's success rate is
gated at 0.8, the floor B1's CLI arms are gated at, and A5 holds when the median of the three is
at least 0.8. Tokens and turns are recorded as absolute numbers with no ratio, because oxmutate
has no build without burgee to divide by.**

## Why not the gap's recommendation

[B-20261101-b1-real-cli-arm-oxmutate](../gaps/B-20261101-b1-real-cli-arm-oxmutate.md) recommended
an arm switched on by a repository variable and met "by the first scheduled run that lands a
reading". The owner has since ruled out the schedule: "No oxmutate in GHA" (2026-11-01, recorded
in PR #1421, `D-20261101-no-mutation-in-gha`). Every task below runs `oxmutate`, and two of them
mutate a fixture, so the arm cannot run in any workflow. That moves A5's evidence from a
scheduled reading to local ones. The noise rule does not move: one B1 reading has swung the pooled
token median from 0.491 to 0.995 (D-20261009-b1-totals-and-explain), so A5 never rests on one.

## The task set

`benchmarks/tasks/oxmutate/*.json`, the same shape as the demo's five tasks. The demo's tasks are
not reused: they name `config get` and `fail`, which oxmutate does not have. Each task has an
`exemplar` its check must pass and a `wrong` answer its check must fail, and `tasks.test.ts` runs
every check against both and against the empty result.

| id | asks | check passes when the answer has | wrong answer it must refuse |
| :-- | :-- | :-- | :-- |
| `oxmutate-discover-flag` | the `run` option that exits 1 below a score threshold, found through `--help` or `--schema` | `--break` | `--threshold` |
| `oxmutate-score` | run mutation on a 6-mutant fixture; the score, killed and survived | `66.67` (or `66.7`), 4 killed, 2 survived | "100%, all 6 killed" |
| `oxmutate-survivors` | after a run already done, list each survivor's file, line and replacement | `age.js`, line 2, `age > 18` and `19` | "no mutant survived" |
| `oxmutate-explain-error` | run `oxmutate survivors --json` with no report; the error's kind, exit code and fix | `runtime`, exit `1`, `oxmutate run` | "a usage error, exit 2" |

The fixture is `benchmarks/fixtures/oxmutate/adult`: `isAdult(age)` returns `age >= 18`, tested
at 30 and at 5. oxmutate makes 6 mutants of it, the tests kill 4, and the two on the boundary
survive (`age > 18`, `19`). That is fixed by the code, not by timing: a slow machine can turn a
kill into a timeout, which oxmutate also counts as detected, so the score does not move.

## The harness

- **A task set and a shim per arm.** `run({ arm: 'oxmutate' })` takes its variant and its tasks from
  one table in `benchmarks/axes/agent.ts`. The shim on the agent's PATH is named `oxmutate`, the
  name its help prints (D-20261008-b1-tool-name), and the agent is allowed `Bash(oxmutate:*)` and,
  since reading 1, `Bash(npx oxmutate:*)`, which reaches the same build (see below). With no `--arm`, nothing changes: the demo variants, the demo's five tasks, the
  `demo` shim.
- **The build under test** is `packages/oxmutate/dist/bin.js` with its native core, the same
  workspace build the demo arms use for theirs. Before the first paid run the arm runs its own
  fixture once (`oxmutate run`); a CLI that cannot spends no session.
- **Setup** runs with the shim on PATH and two variables, `BENCH_FIXTURES` and `BENCH_REPO`, so a
  task can copy its fixture and link the repository's `node_modules` for Vitest. The demo's tasks
  have no setup, so nothing they run changes.
- **Results** land in `benchmarks/results/agent-cli-bench-oxmutate/`, one file a reading, named
  `<date>-<sha>-<hhmmss>-local.json` so three readings of one commit do not overwrite each other.
  Not in `agent-cli-bench/`: that directory's bands and claims read the demo's variants, and the
  CI series they are settled on. The document carries `arm: oxmutate`, and no band or claim.
- **Never in GitHub Actions, twice over.** The axis refuses the arm when `GITHUB_ACTIONS` or `CI`
  is set, and says why, before anything is spent. `benchmarks/oxmutate-arm.test.ts` fails when any
  file under `.github/` passes `--arm`.

## The threshold, and why it is 0.8

The CLI arms gate `success-rate` at 0.8 (`SUCCESS_FLOOR`): below it, the token and turn medians
are over the runs that happened to survive, which is a different measurement. That reason holds
for this arm. The MCP arm is ungated for a reason this arm does not have: it runs in the same job
as the CLI arms, and its failure cost them their reading. This arm runs alone, so its gate costs
no other reading. When at least three readings exist in the arm's directory, each reading also
records the median of their success rates, with the range, gated at the same 0.8. That record is
A5's grade.

No public claim is made. A claim would compare oxmutate against something, and there is no
oxmutate without burgee. The numbers are what an agent spends to do four real tasks with a CLI
built on burgee, and that is what A5 asks for: B1 run against the real CLI.

## The spend, quoted before any run

- **Sessions:** 4 tasks × 5 runs each (`RUNS_PER_TASK`, the B1 floor) = 20 agent sessions a
  reading. Three readings = **60 sessions**.
- **Tokens, estimated:** the 2026-10-27 weekly reading spent 1,873,004 tokens over 25 burgee
  task-runs, about 75,000 a run, cache reads included. At that rate a reading is about 1.5M tokens
  and three are about **4.5M**.
- **Money:** none metered. The runs use the owner's stored `claude` login
  (`BURGEE_USE_CLAUDE_LOGIN=1`), which bills the claude.ai subscription, not an API key. Each
  result's `total_cost_usd` is recorded beside the tokens as the list-price equivalent.
- **Stops:** readings run one at a time, with load below 30. If any run reports the weekly usage
  limit, no further reading is started and A5 stays open.

## Reading 1, and the one change made after it

Reading 1 ran at `b8057bc` on 2026-11-01 with load 25.9 at the start: success rate 0.8, 2,448,494
tokens, $2.26 list-price equivalent. Three tasks passed 5 of 5. `oxmutate-score` passed 1 of 5,
and the transcripts say why: four runs typed `npx oxmutate` and were refused 17 times between them,
because only `Bash(oxmutate:*)` was allowed. In a project with `node_modules`, `npx oxmutate` is how
an agent runs a project's tool, and in the fixture it reaches the same workspace build, through the
linked `node_modules/.bin/oxmutate`. Those runs measured the sandbox, not the CLI.

**The arm now also allows `Bash(npx oxmutate:*)`, and reading 1 does not count.** Its file is kept,
unchanged, in `benchmarks/results/agent-cli-bench-oxmutate/superseded/`, where `armReadings` does
not look. The grade is three readings on the corrected harness. Reading 1 passed the 0.8 gate, so
this change was not made to rescue a failing grade. A median over two harnesses would be a median of
two measurements.

Reading 1 also showed something this arm did not cause. In 11 of its 20 runs the agent ran `ls`,
`cat` or the Read tool, which `--allowedTools` does not deny on `claude` 2.1.286. So the demo arms'
premise, that the CLI's own output is the agent's only channel, does not hold on that `claude`
either. The fix is to the shared spawn, it changes the demo arms, and it is out of scope here.

**The spend, re-quoted.** Reading 1 cost 2.45M tokens, not the 1.5M estimated, because
`oxmutate-score` and `oxmutate-survivors` run oxmutate and read its output. Three more readings
are 60 more sessions, about 7.3M tokens and $6.80 at list price. With reading 1, that is
**80 sessions, about 9.8M tokens and $9 at list price**, all on the subscription login. The stops
are unchanged.

## The three graded readings

Taken 2026-11-01 at `d71dcb0`, one after another, on the owner's M4 Pro, with
`claude` 2.1.286 (CI pins 2.1.283, so `claudePinned` is `false` in each file) and model
`claude-sonnet-4-5`. The build is `packages/oxmutate` at that commit, whose `src/` and
`native/src/` are identical to `oxmutate@1.1.0`'s `gitHead` `f0213f9f0a`. 20 task-runs each.
`d71dcb0` (and reading 1's `b8057bc`) are this change's commits before it was rebased onto
`788c2797ed`; `git diff d71dcb0144 301a3cdbc5 -- benchmarks packages/oxmutate` is empty, so the
harness and the CLI measured are the rebased commit's. The files keep the commit they were taken at.

| reading (`benchmarks/results/agent-cli-bench-oxmutate/`) | load at start | success | tokens / task (median) | turns / task (median) | tokens, all 20 runs | list-price cost |
| :-- | --: | --: | --: | --: | --: | --: |
| `2026-11-01-d71dcb0-220347-local.json` | 16.3 | 0.95 | 62,795 | 3 | 1,923,261 | $1.78 |
| `2026-11-01-d71dcb0-220910-local.json` | 14.2 | 1.00 | 94,273 | 4 | 2,158,733 | $1.91 |
| `2026-11-01-d71dcb0-221455-local.json` | 10.4 | 1.00 | 62,535 | 2 | 2,155,006 | $1.90 |
| **median (range)** | | **1.00 (0.95–1.00)** | **62,795 (62,535–94,273)** | **3 (2–4)** | **2,155,006 (1.92M–2.16M)** | **$1.90 ($1.78–$1.91)** |

The third file carries the grade itself: `success-rate-readings-median` 1, min 0.95, max 1, gated
at 0.8, and `tokens-per-task-readings-median` 62,795. **A5 is met.** Per task, across the 15 runs
of each: `oxmutate-discover-flag` and `oxmutate-explain-error` passed 15 of 15 in 2 to 4 turns,
`oxmutate-score` 15 of 15 in 4 to 7, `oxmutate-survivors` 14 of 15 in 4 to 6.

**The one failure was the check's, not the agent's.** It answered with a table whose `Line`
column read `2`, so neither `line 2` nor `age.js:2` was in the text, and the check refused a
correct answer. The check now also accepts `age.js` followed by the line within a few
punctuation characters, and `tasks.test.ts` holds that answer green and the same table with line
3 red. The readings are left as they were measured. With the fixed check, the first of the three
would read 1.00, and the grade is 1.00 either way.

**Spent:** 80 sessions in all, the re-quoted bound. Reading 1 used 2,448,494 tokens and the three
graded readings 6,237,000, so **8,685,494 tokens and $7.85 at list price**, on the subscription
login. No run reported the usage limit.

## Rejected

- **Reusing the demo's tasks against oxmutate.** They ask for commands oxmutate does not have; every
  run would fail its check and measure nothing.
- **An ungated record, as the MCP arm's.** Its reason, protecting the CLI arms in a shared CI job,
  does not apply to an arm that runs alone.
- **One reading.** B1's run-to-run swing is too large to grade on one.
- **A ratio against commander.** oxmutate was born on burgee and has no off build.
