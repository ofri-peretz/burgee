# Intent — `compat-oracle`

**Status:** review · **Opened:** `2026-09-06` · **Owner:** `@ofri-peretz`

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

## Open questions

None open. Decided at finalisation (2026-09-06): vendor rather than submodule, because
a submodule cannot be transformed; exclude internals rather than stub them, because
stubbing internals invents behaviour upstream does not promise; grade per host rather
than one blended number, because the two hosts disagree and one number would hide it.
