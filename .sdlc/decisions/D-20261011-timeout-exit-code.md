---
id: D-20261011-timeout-exit-code
subject: 'agent-lint-conformance R3 gives a `--timeout` its own exit code and chose 124, GNU `timeout`''s. 124 is inside the 7–125 range `defineError` has published to authors since E7. Which code does `ExitCode.TIMEOUT` take?'
taken: Taken — owner-reversible
date: '2026-10-11'
superseded_by: —
---

**`ExitCode.TIMEOUT` is 6.** The spec's 124 collides with a published code, and the brief for
this build said to record the collision and fall back.

**The collision.** `defineError({ name, code })` accepts any integer from 7 to 125
(`define-error.ts`, `MIN`/`MAX`), and the exit-codes page tells authors the same: "claims a code
from 7 to 125 for one class: below 7 is the contract". A program that already declares
`defineError({ name: 'QuotaError', code: 124 })` is valid today. Making 124 the framework's
would leave two choices, and both break a published promise:

- Keep `defineError` accepting 124. Then exit 124 means *the deadline passed* from burgee and
  *whatever the author said* from their class, and a caller cannot branch on it. That is the
  defect the contract exists to prevent.
- Narrow `defineError` to refuse 124. Then that program throws at startup on the version that
  ships this. The intent's own constraint is that "the exit-code contract only grows" and "no
  existing code changes meaning".

**Why 6.** It is the one number the contract already reserved and nobody can hold: `MIN` is 7,
and `defineError`'s refusal says "0–6 and 130 are the contract's own". No author can have
claimed it, so taking it is purely additive. `exit-code.test.ts` named 6 as "the next free
number" when `AUTH` took 5.

**What is given up.** GNU `timeout(1)` exits 124, and a script written against it branches on
124. A program run *under* `timeout 5s demo …` still exits 124, because the wrapper sets it;
only a program's own `--timeout` exits 6. The help section and `--schema`'s `exitCodes` name it,
and clispec-conformance R2 derives the kind `timeout` from the name, not the number.

**Reversal.** If the owner prefers 124, the cost is narrowing `defineError` to 7–123 and 125 in
a major, with a release note naming the refused code. Nothing else here depends on the number.
