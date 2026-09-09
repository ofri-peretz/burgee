# Intent — `commander-compat`: a drop-in commander, graded by commander's own tests

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md),
> and the reason [`replacement-parser`](../replacement-parser/intent.md) is worth building.

**Status:** review · **Opened:** `2026-09-06` · **Owner:** `@ofri-peretz`

---

## What is wanted

`import { … } from 'selvage/commander'` replaces `import { … } from 'commander'` in an existing
project, and that project's tests still pass. The claim is not the word "compatible" —
it is a published pass rate against commander's own suite, produced by
[`compat-oracle`](../compat-oracle/intent.md) on every PR.

## Why now

Last, and only after the floor ships. From `.sdlc/research/competitor-landscape.md` §5:
vitest overtook jest (99.9M/wk to 48.0M) by copying an API, while stricli invented one
and earns 16 downloads a week. Compatibility is the on-ramp; it is not the product. A
flawless commander clone with no added capability gives nobody a reason to switch.

The bill for this host, counted rather than estimated: **151 public methods**,
**1215 tests** in the vendored suite (node:test, 96 of 105 files).

## Affected users and systems

- `selvage/commander` entry point; no change to `commander-agent`, which keeps working against
  real commander.
- `compat-oracle` gains this front-end as a grading target (`COMPAT_TARGET`).
- `cli-benchmarks` B3 gains its pass rate; B4 gains `core + commander front-end`.

## Constraints

1. **Pay per import** (§6). This front-end lives behind its own specifier. A fixture
   importing only `selvage` must pull zero bytes of it, asserted by B4.
2. **Weight ceiling**: `core + commander front-end` stays under 232KB bundled — the
   installed size of commander itself, measured 2026-09-06.
3. **Never edit the vendored suite to pass.** Rule 2. A failing upstream test is either
   a bug to fix or a C4 divergence with a written reason and its own test.
4. The pass rate ratchets (C5): it may not fall between releases.

## Success criteria

1. `COMPAT_TARGET=selvage/commander npm run compat` reports a pass rate published in CI, on
   the docs site, and in the control bands.
2. Every divergence is listed in `excluded.json` with a reason and an asserting test;
   an unlisted failure is a bug.
3. `examples/demo-cli-commander` runs unmodified against both real commander and this front-end,
   producing byte-identical stdout for every conformance case.
4. B4 shows the ceiling in constraint 2 met.

## Verified against `main` — 2026-09-09

Checked criterion by criterion on `61bd11b9`. **Two of four met cleanly.** The status stays
`review` — and this is one of the two intents closest to `shipped` in the whole roadmap.

- **A pass rate published in CI, on the docs site, and in the control bands** — two of three.
  CI writes the table to `$GITHUB_STEP_SUMMARY` and uploads `results.json`; the docs site serves
  **1360 / 1360 · 100.0%** at <https://burgee.interlace.tools/docs/compatibility>. **The control
  bands do not carry it**: `.sdlc/bands/control-bands.json` has five bands and none of them is a
  pass rate. The command in the criterion, `COMPAT_TARGET=selvage/commander npm run compat`, is
  stale twice over — the name and the mechanism.
- **Every divergence in `excluded.json` with a reason and an asserting test** — **stale, and
  vacuous either way.** No `excluded.json` exists; the mechanism is now the ratchet in
  `packages/compat-oracle/baseline.json` plus design rule X4, "none may be excluded". Nothing to
  record: `results.json` reads `passed: 1360, failed: 0, skipped: 1`.
- **`examples/demo-cli-commander` byte-identical against both** — **met.** 29 cases in
  `examples/conformance/src/commander-parity.test.ts`, asserting `{code, stdout, stderr}`
  equality; all pass.
- **B4 shows the ceiling met** — met as a lock. `./commander` measures **104,593 B** against the
  232 KB commander ceiling, budgeted at 128,000 B in `weight.test.ts:117`.

**One band would close this intent.** A collector reading `packages/compat-oracle/results.json`
into a `compat-commander-pass-rate` band is the only substantive gap; the other two open items
are wording that predates the consolidation into one package.

**That band landed on 2026-09-09** (`cli-benchmarks` B3). `.sdlc/bands/control-bands.json`
carries `compat-commander-pass-rate`, fed by `npm run bench`'s compat axis, which reads the
oracle's `results.json` and re-emits its rate without recomputing it — and gates the count, not
the rounded rate, at `baseline.json`'s 1,360, so losing one case in 1,360 fails the PR instead
of rounding to 99.9%. Criterion 1 is met in all three places. The status stays `review` until a
human accepts it: the two remaining items are the stale wording above.

## Open questions

None open. Decided at finalisation (2026-09-06): grade against the vendored upstream
suite rather than tests we write; ship as a subpath export rather than a separate
package, so `selvage` and its front-ends version together and a user cannot mix
incompatible majors.
