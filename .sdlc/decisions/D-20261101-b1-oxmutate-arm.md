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
  name its help prints (D-20261008-b1-tool-name), and the agent is allowed `Bash(oxmutate:*)` and
  nothing else. With no `--arm`, nothing changes: the demo variants, the demo's five tasks, the
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

## Rejected

- **Reusing the demo's tasks against oxmutate.** They ask for commands oxmutate does not have; every
  run would fail its check and measure nothing.
- **An ungated record, as the MCP arm's.** Its reason, protecting the CLI arms in a shared CI job,
  does not apply to an arm that runs alone.
- **One reading.** B1's run-to-run swing is too large to grade on one.
- **A ratio against commander.** oxmutate was born on burgee and has no off build.
