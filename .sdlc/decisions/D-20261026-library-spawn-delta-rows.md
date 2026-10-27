---
id: D-20261026-library-spawn-delta-rows
subject: 'linegauge and closeout each promise "benchmark rows … on bytes and spawn delta". linegauge''s design says spawn delta does not apply to a library, and closeout''s says it holds from a one-off reading. Is either half met?'
taken: 'Taken by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-26, in the umbrella sweep'
date: '2026-10-26'
superseded_by: —
---

**Neither is met. Each needs a gated row in the `perf` axis, and both intents stay `approved` until
it exists.** This decision is stricter than the designs. It reopens two claims; it closes none.

**What "spawn delta" means for a library in this family.** It means the cost of importing the entry
in a freshly spawned `node`, against importing the incumbent, as a median paired difference over
interleaved rounds. Two layers already measure and gate it this way:

- `roundel` R8: `roundel/tokens − picocolors` and `roundel/chalk − picocolors`
  ([D-20260930-roundel-r8-spawn-bar](./D-20260930-roundel-r8-spawn-bar.md)), in
  `benchmarks/axes/perf.ts`, held by `benchmarks/ratchet.test.ts` › "B2 cold start — roundel R8,
  the paired-delta gate over picocolors";
- `seniority` R9: `seniority/lilconfig − lilconfig`
  ([D-20261026-seniority-spawn-bars](./D-20261026-seniority-spawn-bars.md)), held by
  `benchmarks/ratchet.test.ts` › "B2 cold start — seniority R9, each drop-in held to the incumbent
  it replaces".

`bellpull` R8 reads the phrase as the time to spawn a child, because spawning is what that package
does ([D-20260930-bellpull-spawn-vs-tinyexec](./D-20260930-bellpull-spawn-vs-tinyexec.md)).
That reading is recorded and gated, and it stands.

**linegauge.** `spec.md` § R9 says (2026-09-16) "the spawn-delta clause of R9 does not apply and is
not pending. This package publishes no binary." That is a reason not to measure a CLI's start-up. It
is not a reason not to measure an import. A program that swaps `string-width` for `linegauge`
pays the import on every start, so it is measurable, and two sibling layers measure it. The intent's
criterion 2 asks for the row by name. `benchmarks/axes/perf.ts` `VARIANTS` has no linegauge entry
on `main` at `3d079b15`. **Reopened.** It closes with a `perf` variant pair, `linegauge` against
`string-width` at the release compat-oracle grades (8.3.0). The intent names
`get-east-asian-width` as the bar. PLAN D1 restated the byte bar to the incumbent's tree, and
this applies the same reasoning to time: the bar is the package the user removes, with
`get-east-asian-width` reported beside it as the harder target. The gate is a paired difference
with a runner-noise allowance, the way seniority R9's is.

**closeout.** `spec.md` § R8 says (2026-09-14) "the spawn-delta half holds, measured the same day":
p50 over 21 spawns, 4.5 ms for `closeout/exit-hook` and 4.6 ms for `exit-hook`. That is one hand
reading, and no test or axis repeats it. The intent's criterion 3 asks for benchmark rows, and the
2026-09-14 text calls the half "asserted", which nothing does. **Open.** It closes with a `perf`
variant pair, `closeout/exit-hook` against `exit-hook` at 5.1.0, gated as above. A
`closeout/signal-exit − signal-exit` row beside it is optional, because the criterion names only
exit-hook as the bar. If it is added, it is measured whichever way it reads.

**The byte halves are unaffected.** linegauge's bytes are held under PLAN D1
(`.sdlc/bands/foundation-ceilings.json`, 0.5516) and by four B4 rows, each ≤ 1. closeout's are
held by `closeout-at-incumbent-weight` (B4 0.96 for exit-hook and 0.93 for signal-exit, CI run
`2026-10-26-f6919e9-ci.json`).
