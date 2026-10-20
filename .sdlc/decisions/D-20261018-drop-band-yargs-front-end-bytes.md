---
id: D-20261018-drop-band-yargs-front-end-bytes
subject: 'control-band-yargs-front-end-bundled-bytes: the breach it was opened for is attributed and gone; the +31 B drift that remains does not gate'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs, applied by the roadmap-to-shipped program of 2026-10-18'
date: '2026-10-18'
superseded_by: —
---

**Dropped. The excursion that opened it was attributed on the day (D-161), and it has left the window.**

The watcher opened this intent on 2026-09-27 at **106,824 B**. D-161 attributed the step it
read: 106,523 → 106,868 B is #582 (`120ba7b`, D-121, `.burgee({ floor: true })`). That step was
priced in its own commit and sat under the B4 ceiling. D-161 left the band as it was, to re-centre
once the old points aged out, and they have.

**Evidence, 2026-10-18, stated in full because one rule still fires.** `detect()` over the stored
history plus `benchmarks/results/cli-benchmarks/` still reports **rule 4 (8 consecutive on one side of the mean) at 1σ**:
window mean 108,338.4, σ 12.2, latest 108,345. The window is a new and smaller step, not the
breach this intent records. It went 108,249 → 108,314 B at `2026-10-12-582bc15-ci`, → 108,342 at
`2026-10-13-c736740-ci`, and → 108,345 at `2026-10-13-ba91416-ci`. That is +96 B over 2026-10-12/13,
and +31 B over the four 108,314 B points still in the window. It has been flat at 108,345 for
13 readings. A 1σ rule-4 reading never gates (`--check` exits non-zero only at 2σ), and it ends
when the 108,314 B points leave the window. Holding a Stage-1 intent open for it would be holding
one open for a flat series.

**What covers it instead.** The band, still running. The per-entry byte budgets in
`packages/burgee/src/weight.test.ts` and the B4 gate in `npm run bench -- --check` fail the PR that grows
the entry past its ceiling.

**How to reopen.** If the series moves again, or reaches 2σ, delete
`.sdlc/intents/control-band-yargs-front-end-bundled-bytes/` so the watcher can write a fresh intent
with the new window, or set this one back to `draft`. While this directory exists, the watcher's
`wx` write is a silent no-op (gap A-20261018-dropped-band-intent-masks-breach).
