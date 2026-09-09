# `benchmarks/`

`cli-benchmarks` B1–B7. One axis is built; the other three are designed and are not.

```bash
npm run bench            # run every axis, print the table
npm run bench:record     # build the demos, run, and write results/<axis>/<date>.json
npx tsx benchmarks/bench.ts --axis agent-reliability
```

## `agent-reliability` — the half of B1 that needs no model

The full B1 spawns `claude -p` against each demo and counts tokens and turns. That needs a
model, credentials and a weekly workflow. Until it exists the family's **agent claim has no
number at all**, which is worse than a partial one — so this measures the part that is
deterministic, and says plainly that it is a part.

Every run is non-TTY with stdin closed, because that is the only environment an agent gets.
Three variants, one task set, ten tasks: the same demo CLI built on burgee, on commander and
on yargs.

| Metric | Why an agent cares |
| :-- | :-- |
| **hangs / 100** | a CLI that waits for a human under a pipe is a failed task, every time |
| **exit-code accuracy** | `2` means *rewrite the command*, anything else non-zero means *maybe retry*. A CLI that answers `1` to both has told the agent nothing |
| **structured-output rate** | whether `--json` yields an addressable envelope, on whichever stream carries it, rather than help text to scrape |
| **recovery bytes** | how much output an agent must read to learn what happened — the token proxy, measured rather than modelled |

### 2026-09-09

| variant | hangs/100 | exit code | `--json` | bytes |
| :-- | --: | --: | --: | --: |
| demo-burgee | 0 | **100.0%** | **100.0%** | 83 |
| demo-commander | 0 | 40.0% | 25.0% | 33 |
| demo-yargs | 0 | 40.0% | 25.0% | 472 |

**Read the bytes column honestly.** burgee is not the cheapest: commander's 33 beats it,
because burgee's errors carry a `hint` naming the fix. That is a trade — more bytes per
failure against fewer failed turns — and B1 proper is what will say whether the trade pays.
Nothing here claims it does.

`hangs/100` is 0 for all three, and it stays in the table anyway: it is the metric that goes
non-zero the moment a CLI starts prompting, and it is worth watching before that happens
rather than after.

## Not built

- **B2** cold start, p50/p95 over ≥30 spawns
- **B3** compatibility — read from `compat-oracle`'s JSON, never recomputed
- **B4** bundled KB of a one-import fixture per entry point
- **B1 proper** — tokens and turns against a real agent, weekly

Each lands as another entry in `AXES` and needs no change to `bench.ts` or to the band
collector, which is R5.
