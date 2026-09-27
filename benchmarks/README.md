# `benchmarks/` — one suite, four axes

`npm run bench` produces every number this project claims in public, in one JSON
document, with each number wired to a Stage 6 control band. Intent:
[`cli-benchmarks`](../.sdlc/intents/cli-benchmarks/intent.md).

```bash
npm run bench                    # all four axes; writes results/, prints the tables
npm run bench -- --axis perf     # one axis (repeatable)
npm run bench -- --check         # exit 1 when a measured number is outside its gate
npm run bench -- --no-write      # do not touch results/
npm run bench -- --no-oracle     # B3 reads results.json or skips; never runs the oracle
```

| Axis | Question | Runs |
| :--- | :--- | :--- |
| **B1** agent | does a CLI that meets the floor make an agent cheaper? | weekly, **needs a credential** |
| **B2** perf | are we cheap to start? | every PR |
| **B3** compat | how compatible are we, exactly? | every PR |
| **B4** weight | are we lighter than what we replace? | every PR |

## `reliability` — B1's deterministic half

**Not B1, and not a stand-in for it.** It measures nothing about tokens or turns; those stay
deferred and keep saying so. What it measures is whether the CLI's answer is *legible* to an
agent, which needs no model at all:

| Metric | Why an agent cares | Gated |
| :-- | :-- | :-- |
| `hangs-per-100` | a CLI that waits for a human under a pipe is a failed task, every time | yes, `max: 0` |
| `exit-code-accuracy` | `2` means *rewrite the command*, other non-zero means *maybe retry* | reported |
| `structured-output-rate` | whether `--json` yields an addressable envelope, on whichever stream carries it | reported |
| `recovery-bytes` | how much output an agent reads to learn what happened | reported, **against us** |

Ten tasks per variant, one spawn each, non-TTY with stdin closed — the only environment an
agent gets. Same demo program on burgee, commander and yargs; one variable, the engine.

The bytes figure is the one that does not flatter us: commander reads fewer, because our
errors carry a `hint` naming the fix. That is a trade of bytes per failure against failed
turns, and only B1 proper can settle it. It is measured and published anyway.

## B1 does not run without a credential, and says so

It needs `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` — or, on a machine where `claude`
is already logged in, `BURGEE_USE_CLAUDE_LOGIN=1`, which the harness checks with
`claude auth status` rather than assuming. Either way `claude` is spawned with
`--setting-sources project,local --strict-mcp-config`, so a developer's own `~/.claude`
(measured at 10,228 tokens a turn) is not part of the measurement.

**First run, 2026-09-24** (`results/agent-cli-bench/2026-09-24-2a51440-local.json`, D-147):
burgee 78,225 tokens / 3 turns per task, commander 130,165 / 5; tokens ratio **0.601 — the
≥40% claim is not met**, by 0.001 on n = 25 a side; turns ratio 0.600 — the ≥30% claim is met.

Without a credential the axis reports
`skipped` with the reason, its two bands carry that reason instead of a number, and the
claims it would settle — the roadmap's *≥40% fewer tokens, ≥30% fewer turns* — read
`unmeasured`, never `false`.

Nothing here can produce a plausible-looking figure from a run that did not happen:
`emit.ts` refuses to write a band value that does not name a record produced by an axis
whose status is `measured`, and `emit.test.ts` drives every way that could be got around.
**An unmeasured axis that reads as measured is worse than a missing one.**

Everything except the model is still exercised: `agent.test.ts` runs the harness end to
end against a stub `claude` binary, and `tasks.test.ts` proves each task's check fails on
the un-run state *and* passes on a correct answer.

## What comes out

`results/<suite>/<YYYY-MM-DD>-<sha>-<ci|local>.json`, shaped by
[`results.schema.json`](./results.schema.json):

- **records** — every measurement in one shape, `{ axis, variant, metric, unit, samples,
  median, p95 }` (B5), so one band collector reads all four axes and a fifth needs no
  collector change.
- **bands** — what `scripts/control-bands.ts` reads, at `bands.<id>.value`.
  [`bands.ts`](./bands.ts) is the producer registry, and `bands.test.ts` fails when it and
  `.sdlc/bands/control-bands.json` disagree — so a band cannot reference a number nothing
  emits.
- **claims** — every public number, settled: `met`, not met, or `unmeasured` with a reason.

Two suites, because the axes run on two cadences: `cli-benchmarks` (perf, compat, weight —
free and deterministic, gate every PR) and `agent-cli-bench` (B1 — costs money, weekly).

### Observations and the published measurement

Every run writes an **observation**, `<date>-<sha>-ci.json` on a CI runner and
`<date>-<sha>-local.json` anywhere else. A sha names a commit, not a run: before the suffix a
laptop's run and the nightly's run of the same commit had one path, and landing either deleted
the other (D-142). Observations named before 2026-09-22 have no suffix and are all CI runs.

The bands read **CI observations only**, chosen by `machine.ci` inside the document rather
than by the name — a series that stops updating looks perfectly healthy and landing every CI
run is what keeps that honest, and a series that mixes two machine classes is not one series.
Local observations are still worth landing; they are data for a person, not for a σ.

Exactly one file per suite is the **published measurement**, `<date>.json` with no sha. It is
what `/docs/benchmarks` is generated from and what `docs.test.ts` pins `comparison.mdx`
against, and it is written only by:

```bash
npm run bench -- --publish
```

That flag is the *person choosing*, and it is the whole point. B2's milliseconds are a property
of the box: the same commit reads `+14.0 ms` on a two-core runner and `+33.8 ms` on an M4 Pro,
and `burgee ÷ cac` reads 1.443 against 1.708. Until 2026-09-21 any complete run wrote the
published name, so a plain `npm run bench` on a laptop republished the project's public figures
as a side effect of measuring anything — and `bench.yml` moves published-named files aside
under the commit that produced them, so the laptop was the *only* path that ever published.
Now it is a flag, and republishing is a decision with a commit message attached to it.

## The numbers are machine-dependent, and the bands are not

B2's milliseconds are a property of whatever ran them; every results file carries the
machine, and the tables say so. What is *banded* and *gated* is a ratio between two spawns
interleaved in the same run — which cancels most of the machine out, and is the only reason a
cold-start number is bandable at all. Issue #27 is why: an absolute millisecond ceiling
red-lit two PRs that had touched none of the code.

*Most*, not all, and that is why the bands read CI runs only. Over the committed observations
`cold-start-ratio` read, on 2026-09-22, a mean of 1.076 with σ 0.014 across 109 CI runs, and 1.303 across four
M4 Pro runs — every local point more than ten CI σ above the CI mean. The ratio is fine for a
gate, which has headroom; it is not fine for a band whose job is to notice 2σ (D-142).

## Reproducing, from a clean checkout

```bash
npm install
npx turbo run build
npm run bench -- --check
```

B3 runs `compat-oracle` when the checkout has no `results.json` (about 25 seconds).

**B2 and B4 both resolve every package through [`resolve.ts`](./resolve.ts)**, against the
ranges `benchmarks/package.json` declares, and a mismatch stops the run. The workspace root
has an older commander hoisted; resolving from there compares the front-end against a
commander from 2021. B4 was given that guard after CI caught it — B2 was not, and B2 is the
axis that feeds `cold-start-ratio`. With `benchmarks/node_modules/commander` moved aside it
reported the ratio 14% higher, inside its gate, with nothing on the record saying which
commander it had raced. Both axes now write the resolved version and path into every row.

B4's **installed** column counts each dependency where npm actually put it: resolved from
the directory of the package that depends on it, deduplicated by resolved path. Resolving
everything from `benchmarks/` — and deduplicating by name — put `boxen` at 353,976 bytes
against 747,463 on disk.
