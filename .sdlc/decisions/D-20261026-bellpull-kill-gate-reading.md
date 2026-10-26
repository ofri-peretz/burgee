---
id: D-20261026-bellpull-kill-gate-reading
subject: 'bellpull''s kill gate asks for tinyexec''s weekly downloads, last publish date and current API, recorded on the day it is evaluated. No such reading was ever recorded (D-048 has the verdict, not the numbers). Read on 2026-10-26: does bellpull build or drop?'
taken: 'Taken by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-26, in the umbrella sweep'
date: '2026-10-26'
superseded_by: —
---

**Build. tinyexec has absorbed part of resolution, but only inside its own spawn. It exposes no
resolution answer and no outcome, and it is not a drop-in for anything bellpull replaces. The
numbers are below, taken today. The intent's claim that tinyexec does no resolution is false
for 1.3.1, and is restated here.**

**The reading, 2026-10-26.**

| | tinyexec | source |
| :-- | :-- | :-- |
| version | 1.3.1, published 2026-09-03T08:50Z (the same release the intent cited on 2026-09-09) | `npm view tinyexec version time` |
| weekly downloads | **106,919,562** (2026-10-16 to 2026-10-22). The intent recorded 119.5 M; execa is 108,334,862 in the same week | `api.npmjs.org/downloads/point/last-week/tinyexec` |
| dependencies | none | `npm view tinyexec dependencies` |
| abandoned? | no: the last publish was 53 days ago, against a 12-month bar | — |
| exports | `x`, `xSync`, `exec`, `execSync`, `normalizeSpawnCommand`, `NonZeroExitError` and types | `node_modules/tinyexec/dist/main.d.mts` (1.3.1, the pinned `benchmarks/` devDependency) |
| executable resolution | **internal only.** `resolveCommand()` walks `PATH` with `PATHEXT` on Windows, and `addNodeBinToPath()` prepends every ancestor's `node_modules/.bin` and node's own directory. Both feed the spawn. `normalizeSpawnCommand()` is exported and returns the rewritten `{ command, args, options }`. Nothing returns *which* file answered or *which* `PATH` entry it came from | `dist/main.mjs` |
| result shape | `Output { stdout, stderr, exitCode }`. The process object adds `pid`, `killed`, `signalCode`. There is no outcome verdict, no duration, no command echo and no rendering. A non-zero exit throws `NonZeroExitError` only under `throwOnError` | `dist/main.d.mts` |

**Against the gate's three rows.**

- *"still does no executable resolution and returns no structured result → build"*: half true.
  It returns no structured result in the intent's sense (`{ ok, code, signal, stdout, stderr,
  duration, command }`, rendered three ways). It does resolve a bare name for its own spawn,
  which is the job `cross-spawn` and `npm-run-path` do.
- *"has absorbed resolution or a result shape → drop"*: the internal half of resolution, yes. The
  half a caller can read, no: there is no `which`, no `from`, no `ext`. And no result shape.
- *"abandoned → build, weight pitch available"*: no.

**Why build, and why that is not the gate waved away.** The drop row exists so that bellpull is
never "the third-best answer in a layer" (intent § The kill gate). That claim is measured below,
not argued.

1. **bellpull is a graded drop-in for two incumbents tinyexec does not replace.**
   `bellpull/cross-spawn` passes cross-spawn's own suite 68 / 68 and `bellpull/node-which` passes
   which's 5 / 5 (`packages/compat-oracle/baseline/`), and `burgee migrate` rewrites both imports.
   A user of `cross-spawn` cannot move to tinyexec by changing an import.
2. **Resolution as an answer.** `whichSync` returns `{ path, from, ext }`, and `Result.executable`
   carries it. Neither exists in tinyexec. This is the part of "resolution" the intent names
   first (`which`, 290 M/wk).
3. **The outcome and its three projections** (Y5): `format`, `toJson` and `toEvent` over one
   verdict, held by `packages/bellpull/src/matrix.test.ts` › "one result, three renderings (R5,
   Y5)" and published at `bellpull.interlace.tools/docs/recipes/agent-output`.
4. **Not heavier and not slower, measured.** B4 `bellpull ÷ tinyexec` 0.986 bundled and B5 0.986
   spawn time (CI, `benchmarks/results/cli-benchmarks/2026-10-26-f6919e9-ci.json`), each gated
   at 1.

**What changes.** The intent's sentence "Neither `tinyexec` nor `nano-spawn` does executable
resolution (`which`, 290 M/wk) or `PATH` augmentation (`npm-run-path`, 104 M/wk)" is restated
as: *tinyexec 1.3.1 resolves a bare name and augments `PATH` inside its own spawn, but it returns
neither as an answer, ships no `which`, and is not a drop-in for `cross-spawn`, `which` or
`npm-run-path`.* bellpull's pitch is the answer and the graded swap. It is not that tinyexec
cannot run `foo` on Windows. **Re-read this table when tinyexec ships a release that exports a
resolver or an outcome type.** That would trip the drop row as written. `upstream-watch` already
lists tinyexec among the competitors it watches.

**Criterion 1 of `bellpull/intent.md` is held by this reading.** It was the only open item of
the gate. D-048 (2026-09-20) recorded the verdict without the numbers.
