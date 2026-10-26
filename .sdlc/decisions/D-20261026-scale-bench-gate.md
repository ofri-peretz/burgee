---
id: D-20261026-scale-bench-gate
subject: 'burgee Z5: where does the gate on the 250-command `--help` / `--schema` bench sit, and what did the first readings say?'
taken: 'Taken by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-26'
date: '2026-10-26'
superseded_by: —
---

**The gate is 3× on the paired 250 ÷ 30 ratio, per surface, and it is not banded yet.** The
umbrella's design gate restated Z5 to a bench
([D-20261025-burgee-umbrella-design-accepted](./D-20261025-burgee-umbrella-design-accepted.md)):
a generated 250-command program beside a 30-command one, `--help` and `--schema` timed by the
`perf` axis, and a precompute intent opened if the 250-command reading is more than 3× the
30-command one. The gate is that sentence, so a red gate means "open the precompute intent", not
"a runner had a bad minute".

**What was built.** `benchmarks/axes/scale.ts` writes both programs per run under the gitignored
`benchmarks/.fixtures-scale/`, in `examples/demo-cli-large`'s shape (five groups, a shared option
set, one handler in ten loaded lazily), proves each answers `--help` and `--schema` as the program
it was generated as and imports no lazy handler, then times all four in 24 interleaved rounds after
one warm-up. `perf.ts` appends its rows, so `npm run bench -- --axis perf --check`, which
`bench.yml` runs on every PR, gates them. Rows: `scale-start-ms` per size and surface (median, p95
and the min–max range in `detail`), and `scale-ratio` per surface, gated at `max: 3`.

**Failing-first.** With the ceiling at 0, a live run's two ratio rows failed the gate: `--help`
1.012 and `--schema` 1.112, both "above its ceiling of 0". At 3 the same run passed.
`benchmarks/scale.test.ts` › "is the decision’s 3×, gates the median of paired rounds, and fires
one step over it" keeps both directions.

**The readings it was set against.** Four runs of 24 rounds on an M4 Pro with the load average at
23 to 35, which is the noisiest this laptop gets:

| run | `--help` 250 ÷ 30 | `--schema` 250 ÷ 30 | 30-cmd `--help` ms | 250-cmd `--help` ms |
| --: | --: | --: | --: | --: |
| 1 | 1.225 | 1.117 | 66.42 | 95.26 |
| 2 | 0.956 | 1.045 | 322.13 | 340.59 |
| 3 | 1.021 | 0.867 | 100.89 | 112.66 |
| 4 | 1.018 | 1.155 | 81.30 | 88.79 |

**Median of the four medians:** `--help` 1.020 (range 0.956–1.225), `--schema` 1.081 (range
0.867–1.155). The absolute milliseconds moved 5× between runs and the ratio did not, which is why
the ratio is the gated number. A 250-command program costs about the same to start as a 30-command
one: the manifest is built from declarations, and no handler is imported. The reading is about a
third of the gate, so **no precompute intent is opened.**

**Why 3 and not the measured spread plus headroom**, as the cold-start ceilings are set: those
ratios settle a claim against an incumbent, and the ceiling is a ratchet over a series. This ratio
settles a decision, and the decision named its threshold before anything was measured. Moving it to
1.5 because the first reading is 1.0 would turn a threshold into a series nobody has collected.

**Not banded yet**, as the design gate said. When CI has landed eight readings in
`benchmarks/results/cli-benchmarks/`, a band on `scale-ratio` is a separate change.
