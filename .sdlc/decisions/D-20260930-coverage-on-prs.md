---
id: D-20260930-coverage-on-prs
subject: 'Do the per-package coverage thresholds gate every PR, or run only in the weekly codecov job?'
taken: Accepted
date: '2026-09-30'
superseded_by: —
---

**They gate every PR.** The owner decided this on 2026-09-30. `quality-full.yml`'s `coverage` job runs each changed package's `coverage` script, plus the packages that depend on it (turbo `...[base]`, limited to `packages/*`), against the thresholds in its own vitest config. It feeds the required `Quality (Full) Gate`. A push to main, the merge queue's base aside, the weekly scan and a dispatch cover every package. `codecov.yml` stays the weekly upload and gates nothing.

Before this, the thresholds ran only in the weekly job, where burgee's had been failing unseen: codecov run 36596035754, 2026-09-29, failed at functions 99.85% and lines 99.95%, and uploaded nothing. Both jobs now install zsh and fish, because ubuntu-latest has neither and burgee's real-shell completion cases skipped without them. `REQUIRE_SHELLS=1` turns a missing shell into a failure instead of a skip. When a threshold fails, the job prints every uncovered line, function and branch from the lcov, so the gap can be read from the log.

Rejected: running every package on every PR. A leaf-only PR would then pay for nine suites under coverage. Only packages that changed, or depend on one that did, can change their own coverage.
