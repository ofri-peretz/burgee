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

## B1 does not run here, and says so

It needs `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`. Without one the axis reports
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

`results/<suite>/<YYYY-MM-DD>.json`, shaped by [`results.schema.json`](./results.schema.json):

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

## The numbers are machine-dependent, and the bands are not

B2's milliseconds are a property of whatever ran them; every results file carries the
machine, and the tables say so. What is *banded* and *gated* is a ratio between two spawns
interleaved in the same run — which cancels the machine out, and is the only reason a
cold-start number is bandable at all. Issue #27 is why: an absolute millisecond ceiling
red-lit two PRs that had touched none of the code.

## Reproducing, from a clean checkout

```bash
npm install
npx turbo run build
npm run bench -- --check
```

B3 runs `compat-oracle` when the checkout has no `results.json` (about 25 seconds); B4
resolves every incumbent from `benchmarks/`, whose `package.json` pins the versions —
the workspace root has an older commander hoisted, and resolving from there would compare
the front-end against a commander from 2021.
