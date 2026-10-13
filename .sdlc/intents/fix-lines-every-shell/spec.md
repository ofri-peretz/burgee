# Design — a `fix:` line runs as written in the shell it was printed for

Intent: [`intent.md`](./intent.md). **Status:** review.

---

## Requirements

- **R1 — Quote by platform.** `shellWord(word, platform = process.platform)`: on `win32` a word
  that needs quoting is `'…'` with each `'` doubled; elsewhere today's form. *Check:*
  `packages/burgee/src/shell-word.test.ts` (new): `shellWord("it's", 'win32') === "'it''s'"`; red
  on main (`'it'\''s'`).
- **R2 — Every caller goes through it.** No other quoting of a `fix` word exists in
  `packages/burgee/src`. *Check:* a case in the same file greps the sources for `'\\''` outside
  `unknown-option.ts`; holds on main and must keep holding.
- **R3 — It runs.** On Windows cells, a test builds a refusal whose fix carries `'` and `~`, and
  runs it with `pwsh -NoProfile -Command`; exit 0. *Check:*
  `packages/burgee/src/fix-line-runs.test.ts` (new), skipped only where `pwsh` is absent and
  failing there when `REQUIRE_SHELLS=1`; red on main on `windows-latest`.
- **R4 — Bytes measured.** The core bundle and `.` entry are measured before and after, and any
  growth goes to a decision with the measurement. *Check:* B4's core ceiling and
  `weight.test.ts`.

## Design

One branch in one function. The platform is a parameter so tests on Linux cover both forms; the
default reads `process.platform` once.

## Verification

| R | Check | Red on main |
| :-- | :-- | :-- |
| R1 | `shell-word.test.ts` | POSIX form on `win32` |
| R2 | `shell-word.test.ts` | — (holds today; must keep holding) |
| R3 | `fix-line-runs.test.ts` on `windows-latest` | `pwsh` parse error |
| R4 | B4 weight axis, `weight.test.ts` | — |

No state machine; no model.

## Rejected alternatives

- **A `shell` key in the envelope.** Bytes on every failure, for a choice the platform already
  makes.
- **cmd.exe quoting.** No single rule makes every word safe there (D-20261012-fix-lines-shell-target).
- **Double quotes everywhere.** `$` and backticks expand inside them in both shells.

## Out of scope

- Shells a user chose over the platform default (fish, nushell). A fish user on Linux reads a
  POSIX-quoted word correctly for every word `shellWord` can produce except a `'` inside a word.
