# Intent — `compat-oracle`

**Status:** shipped · **Opened:** `2026-09-06` · **Owner:** `@ofri-peretz`

**State assigned 2026-09-09** from repo evidence, at the owner’s direction. **Evidence:** both suites vendored in full and both gates proven; commander 1,361/1,361 and yargs 804/804 in the same run. Publishing the page is `docs-deploy`’s remainder, not this intent’s.

---

## What is wanted

Every commander and yargs behaviour we claim to support is graded by *their* test
suite, not by ours, and the grade is a published number that can only go up.

Concretely: `npm run compat` runs commander's 1,215 public-surface tests and yargs'
1,185 tests against whichever implementation a one-line shim points at, prints a pass
rate per host, and exits non-zero if the rate falls below the recorded baseline. The
number appears in CI on every PR, in the docs site, and in `.sdlc/bands/control-bands.json`.

## Why now

Measured 2026-09-06 (`.sdlc/research/competitor-landscape.md` §5). commander's 105 test
files import the library as `from '../index.js'` and assert with `node:test` +
`node:assert/strict`. Copying the suite and rewriting that one specifier redirects the
entire upstream gate at any implementation:

| | |
| :--- | ---: |
| files redirectable (public surface) | 96 / 105 |
| files testing internals (`../lib/command.js`, out of scope) | 9 |
| tests executed through the shim | 1,215 |
| passing against real commander | 1,210 |

The 5 failures are fixture subprocesses resolving from a flat copy's root, not gaps.

Two things follow. `AI_NATIVE_SDLC.md` rule 2 asks for a feedback loop that exits
non-zero before work starts — for compatibility the competitor already wrote it, and
not wiring it up is leaving a free acceptance test on the table. And the compatible
replacement (`.sdlc/research/competitor-landscape.md` §5) is only credible if its claim
is a checkable number rather than the word "100%".

Building it now, before `commander-agent`, means every later intent is graded against
it from its first commit instead of retrofitting compatibility at the end.

## Affected users and systems

- New package `@interlace/compat-oracle` (internal, never published).
- `.github/workflows/quality.yml` gains a `compat` job; `quality-full.yml` gains the
  Node × OS matrix.
- `.sdlc/bands/control-bands.json` gains `compat-commander-pass-rate`,
  `compat-yargs-pass-rate`, `node-matrix-green`.
- `apps/docs` gains a compatibility page fed by the emitted JSON.
- Every current and future layer package is graded by it.

## Constraints

- Upstream suites are **vendored under their own licence** (commander MIT, yargs MIT)
  with the source commit recorded, and refreshed by a scheduled job — never edited by
  hand except for the single import specifier rewrite, which must be a scripted,
  reviewable transform.
- The 9 internals files stay out of scope and that exclusion list is explicit, named
  and justified in the repo — an exclusion that grows silently is how a compat claim
  becomes a lie.
- The oracle must not become a reason to change our public API to match a host's
  internals: it grades the compat front-ends, not `cli-core`.
- Runs in under 60s locally so it can sit in the pre-push hook.

## Success criteria

1. `npm run compat` prints a table of `host, tests, passed, rate, baseline` and exits
   non-zero when any rate is below its baseline.
2. Baselines are recorded in `.sdlc/bands/` and only a PR can lower one, with a written
   reason in the PR body.
3. `compat-commander` reports ≥ 1,210/1,215 against real commander today — the gate
   grading a known-good implementation proves the gate, per rule 4.
4. A scheduled workflow refreshes the vendored suites and opens a PR when upstream
   changes the count, so the treadmill is visible rather than silent.
5. The Node compatibility matrix (C3) is green on every Node LTS in `engines` across
   Linux, macOS and Windows.
6. The published rate appears on the docs site and in `README.md`.

## Verified against `main` — 2026-09-09

Checked criterion by criterion on `61bd11b9`. **Three of six met, one half.** The status stays
`review`. This is the machine the whole roadmap's credibility rests on, and it works — six hosts
graded, six controls, everything vendored.

- **A table of host, tests, passed, rate, baseline, exiting non-zero below baseline** — **met.**
  `packages/compat-oracle/src/report.ts` renders host, bar, `passed / total`, rate and a
  Δ-against-baseline arrow, and exits non-zero below `baseline.json`.
- **Baselines recorded in `.sdlc/bands/`, lowerable only by a PR with a written reason** —
  **not met as written.** The baseline lives at `packages/compat-oracle/baseline.json`, not under
  `.sdlc/bands/`, and there is no `compat-*-pass-rate` band in `control-bands.json`. The
  "written reason in the PR body" convention is documented in `scripts/compat-page.ts:102` and
  enforced by nothing.
- **`compat-commander` reports ≥ 1,210 / 1,215 against real commander** — met in substance; the
  number in the criterion is stale. `--control` reports **1360 / 1360**. The vendored suite is
  1,360 tests, not 1,215, and yargs is 804, not 1,185.
- **A scheduled workflow refreshes the vendored suites and opens a PR when the count changes** —
  met as wiring. `compat-refresh.yml` is weekly (`30 5 * * 1`) and carries `vendor-diff.md`;
  `compat-upstream.yml` is daily and opens one issue per host release. Neither has yet had cause
  to fire — `compat-refresh.yml` has no runs at all, and no incumbent has released since the repo
  was created — so the treadmill is wired but unexercised.
- **The Node matrix green on every Node LTS in `engines` across Linux, macOS and Windows** —
  **not met, and the workflow says so itself.** `compat.yml` runs all three OSes but `node: [24]`
  only, above a comment reading *"`engines` still says `>=24`, so C3 is not met while this
  stands"*. Every published package declares `>=24`, so Node 26 is claimed and untested.
- **The published rate appears on the docs site and in `README.md`** — half. The docs page serves
  every number. The **root `README.md` publishes no rate at all** — line 56 still says "graded by
  commander's own 1,215 tests and yargs' 1,185", both of which are stale counts, and no pass rate
  follows them.

## Open questions

None open. Decided at finalisation (2026-09-06): vendor rather than submodule, because
a submodule cannot be transformed; exclude internals rather than stub them, because
stubbing internals invents behaviour upstream does not promise; grade per host rather
than one blended number, because the two hosts disagree and one number would hide it.
