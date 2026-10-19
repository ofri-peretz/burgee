# Intent — `yargs-compat`: a drop-in yargs, graded by yargs's own tests

> Stage 1 artifact. Child of [`burgee`](../burgee/intent.md),
> and the reason [`replacement-parser`](../replacement-parser/intent.md) is worth building.

**Status:** shipped · **Opened:** `2026-09-06` · **Owner:** `@ofri-peretz` · **Shipped:** 2026-10-18 on [`1013b65db5`](https://github.com/ofri-peretz/burgee/commit/1013b65db5), verified against `main` at `1013b65db5` — all 4 criteria locked by the compat baseline, `yargs-parity.test.ts` and `weight.test.ts` · approved and shipped 2026-10-18, accepted under the owner's 2026-10-12 delegation

**State assigned 2026-09-09** from repo evidence, at the owner’s direction. **Evidence:** `packages/burgee/src/yargs-*.ts` and the `./yargs`, `./yargs/helpers`, `./yargs/parser` exports; **804 / 804**, where real yargs scores 802.

---

## What is wanted

`import yargs from 'burgee/yargs'` replaces `import yargs from 'yargs'` in an existing
project, and that project's tests still pass. The claim is not the word "compatible" —
it is a published pass rate against yargs's own suite, produced by
[`compat-oracle`](../compat-oracle/intent.md) on every PR.

## Why now

Last, and only after the floor ships. From `.sdlc/research/competitor-landscape.md` §5:
vitest overtook jest (99.9M/wk to 48.0M) by copying an API, while stricli invented one
and earns 16 downloads a week. Compatibility is the on-ramp; it is not the product. A
flawless yargs clone with no added capability gives nobody a reason to switch.

The bill for this host, counted rather than estimated: **108 public methods**,
**804 public tests** (plus 23 internals) in the vendored suite (mocha, `.mjs`), pinned to yargs 18.1.0.

## Affected users and systems

- `burgee/yargs` and `burgee/yargs/helpers` entry points.
- `compat-oracle` gains this front-end as a grading target (`COMPAT_TARGET`).
- `cli-benchmarks` B3 gains its pass rate; B4 gains `core + yargs front-end`.

## Constraints

1. **Pay per import** (§6). This front-end lives behind its own specifier. A fixture
   importing only `burgee` must pull zero bytes of it, asserted by B4.
2. **Weight ceiling**: the front-end's reachable bytes stay under what yargs installs
   for the same surface (`weight.test.ts` entry `./yargs`, 256,000 B).
3. **Never edit the vendored suite to pass.** Rule 2. A failing upstream test is either
   a bug to fix or a divergence with a written reason in `spec.md`; nothing is excluded.
4. The pass rate ratchets (C5): it may not fall between releases.

## Success criteria

1. `npm run compat` reports a pass rate published in CI, on the docs site, and in the
   control bands.
2. Every divergence is a failing upstream test with a recorded reason in `spec.md`;
   an unrecorded failure is a bug.
3. `examples/demo-cli-yargs` runs unmodified against both real yargs and this front-end,
   producing byte-identical stdout for every conformance case.
4. B4 shows the ceiling in constraint 2 met.

## Shipped — 2026-10-18

**Status raised to `shipped`.** Every criterion was checked against `main` at `1013b65db5` in the
roadmap-to-shipped Batch 0 pass (`.sdlc/research/roadmap-to-shipped-2026-10.md`).

Accepted at Design→Build and stamped in one pass, under the owner's 2026-10-12 delegation. Every
criterion was already met on the 2026-09-09 reading below, apart from the band, which landed the
same day. The stamped numbers are now **816 / 816**, against yargs 18.2.0
([`D-20260930-burgee-yargs-1820-regrade`](../../decisions/D-20260930-burgee-yargs-1820-regrade.md)).
The 804 / 804 in the history below is that day's suite.

| criterion | check | result |
| :-- | :-- | :-- |
| 1. a pass rate in CI, on the docs site, in the bands | `npm run compat -- yargs`; the `compat-yargs-pass-rate` band (derived from the baseline by `control-bands.ts`); `/docs/compatibility` | commander 1360 / 1360, yargs 816 / 816; the band reads inside over 308 points |
| 2. every divergence a recorded failing test | `npm run compat -- yargs` beside its control, `--control` | `burgee/yargs` fails none of 816, so there is no divergence to record. The control, real yargs 18.2.0 in the same run, scores yargs 814 / 816 |
| 3. `demo-cli-yargs` byte-identical against both | `examples/conformance` `yargs-parity.test.ts` | 26 passed |
| 4. B4 shows the constraint-2 ceiling met | `weight.test.ts` (`./yargs`), `yargs/burgee.test.ts` | 66 passed |

## Verified against `main` — 2026-09-09

Checked criterion by criterion on `61bd11b9`. **Three of four met.** The status stays `review`.

- **A pass rate published in CI, on the docs site, and in the control bands** — two of three, the
  same gap as `commander-compat`. The docs page serves **804 / 804 · 100.0%** for `burgee/yargs`
  beside the real-yargs control at **802 / 804 · 99.8%**. No compat band exists in
  `.sdlc/bands/control-bands.json`.
- **Every divergence is a failing upstream test with a recorded reason** — met, vacuously:
  `results.json` reads `passed: 804, failed: 0, skipped: 1`, internals 23 / 23. There is nothing
  to record, and `spec.md:14` records X4.
- **`examples/demo-cli-yargs` byte-identical against both** — **met.** 26 cases in
  `examples/conformance/src/yargs-parity.test.ts`; `hosts.ts` swaps only the factory.
- **B4 shows the ceiling met** — met. `./yargs` measures **216,594 B** against the 256,000 B
  budget the criterion itself names, in `weight.test.ts:124`.

Beating the real package on its own suite — 804 against 802 — is the strongest single number in
the repo, and it is published. The one thing between this intent and `shipped` is a band.

**That band landed on 2026-09-09** (`cli-benchmarks` B3). `.sdlc/bands/control-bands.json`
carries `compat-yargs-pass-rate`, fed by `npm run bench`'s compat axis, which reads the oracle's
`results.json` and re-emits its rate rather than computing a second one — with a deterministic
gate at `baseline.json`'s 804 passing cases, so a single lost case fails the PR. Criterion 1 is
met in all three places. The status stays `review` until a human accepts it.

One thing the band made visible and did not smooth over: the oracle reports yargs as
`tests: 803, passed: 804`, because the host's own TAP summary counts the case it skips on this
OS as a pass. The rate is computed against `max(reference, tests)`, so the arithmetic holds —
but the 100% contains one case that could not have failed, and the benchmark record carries
`passed`, `tests`, `skipped` and `reference` in its `detail` so a reader can see that.

## Open questions

None open. Decided at finalisation (2026-09-06): grade against the vendored upstream
suite rather than tests we write; ship as a subpath export rather than a separate
package, so `burgee` and its front-ends version together and a user cannot mix
incompatible majors.

## Incumbents

`yargs` — the trackers whose issues are this surface's demand signal, and the input
`scripts/mine-issues.ts` (PLAN 4.1) needs in order to write the `issues.md` beside this file.

It is declared here because the miner's own `LAYERS` table, in
`packages/compat-oracle/src/demand.ts`, knows the nine *packages* and not the surfaces of any
one of them: `burgee`'s entry names `commander` and `yargs` for the whole package, and the six
surface intents are not in the table at all. Until that table reads this line,
`npx tsx scripts/mine-issues.ts yargs-compat` answers `no layer matched`.

Chosen from evidence rather than from the slug, which is the reason to write it down at all.
The rule: **the front-end this surface adapts, plus every other tracker this intent's own body
cites three or more times.** Here that is `yargs` alone. Trackers cited once or twice
(none — it cites no tracker by number) are comparisons this intent draws, not incumbents it replaces; mining them would file
issues under a surface no criterion here answers.

<!-- incumbents: yargs -->
