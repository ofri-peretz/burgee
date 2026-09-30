---
id: D-20260930-closeout-1-0-evidence
subject: 'Does closeout meet the 1.0 bar D-170 set for linegauge and flagstaff, and on what evidence'
taken: Taken
date: '2026-09-30'
superseded_by: —
---

**Yes. closeout meets every written 1.0 criterion. This records the evidence. It does not release anything**: no changeset is written. Cutting 1.0.0 is the owner's call, as it was for D-170. **Criterion 1, the spec is fully built.** `.sdlc/intents/closeout/spec.md` has no `Not built` row. R1–R12 each have a `## What shipped` entry, and `scripts/plan-progress.ts` reports `✓ 3.3 closeout at 1.0` (`designComplete('closeout')`). The spec's `## Where this document and the code disagree` section is out-of-date text, not unbuilt work: R7's file name, the file map, and R6's root default. D-133 restated R6 as three subpaths, and all three are built and graded. **Criterion 2: every drop-in passes 100% of its incumbent's own suite at the latest release, level with its control.** Latest releases on 2026-09-30 (`npm view`): `exit-hook` 5.1.0, `restore-cursor` 5.1.0, `signal-exit` 4.1.0. Each is the vendored version (`vendor/<host>/PROVENANCE`), so nothing was re-vendored. The grades are from `node packages/compat-oracle/dist/bin.js exit-hook restore-cursor signal-exit` and the same run with `--control`, on darwin, Node 24.13.0, at `1970ee50`:

- `closeout/exit-hook`: **21 / 21**. The control is 21 / 21.
- `closeout/restore-cursor`: **6 / 6**. The control is 6 / 6.
- `closeout/signal-exit`: **126 / 127 registered**. The control is 126 / 127.

On ubuntu, where the reference is recorded, signal-exit reads **134 / 135** and its control reads **134 / 135**. That is the `Compatibility` ratchet job, run 36718193124 at `8a698881`, both steps. darwin registers 8 fewer cases, the declared `conditionalCases`: Linux-only signals, 4 × 2 loops. The one case both sides fail is the same case. Its TAP was captured with `COMPAT_TAP_DIR` on both runs: `signal-exit-test.ts` › `does not exit if user handles signal`, which is the declared `controlFailures`. signal-exit 4.1.0 fails that case against itself on current Node. So every drop-in passes as many cases as its incumbent does, in the same harness. That is D-137's "level", and nothing in `baseline/` or on the compatibility page moved. **Criterion 3: the coverage gate.** `npx vitest run --coverage.enabled` in `packages/closeout` reads **100 / 100 / 100 / 100**: 394 statements, 199 branches, 111 functions, 333 lines, with 247 tests passing. **What 1.0 would promise, on D-170's terms:**

- every published entry of `closeout`: `.`, `./once`, `./cursor`, `./plugin`, `./restore-cursor`, `./exit-hook`, `./signal-exit` and `./signal-exit/signals`;
- the plugin `schema.json`;
- each drop-in, graded by its incumbent's own suite at the major named above.

**Out of scope:** earlier majors, and `signal-exit` 3 in particular, which exports a function where 4 exports `onExit`. `burgee migrate` leaves a project on another major alone (`SUPPORTED_MAJORS`). **Known misses that do not block the bar:** R8's byte half. `closeout/exit-hook` is 11,841 B against `exit-hook`'s 4,458 B. The spec records that miss and the restatement that replaced the bar, and the spawn-delta half holds.
