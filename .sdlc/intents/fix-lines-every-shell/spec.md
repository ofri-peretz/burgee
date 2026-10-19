# Design — a `fix:` line runs as written in the shell it was printed for

Intent: [`intent.md`](./intent.md). **Status:** approved — accepted under the owner's 2026-10-12 delegation.

Refreshed 2026-10-18 against `main` at `1013b65db5`.

---

## Requirements

- **R1 — Quote by platform.** The signature becomes
  `shellWord(word, platform = process.platform)`.
  - **On `win32`**, a word is left bare only if it matches the POSIX-safe set
    (`/^[\w@%+=:,./-]+$/u`, today's line 73) **and** none of the following holds:
    - it starts with `@` (splatting);
    - it contains `,` (the array operator in argument mode);
    - it is `--%` (stop-parsing).

    Any other word is `'…'`, with each `'` doubled.
  - **Elsewhere**, the output is byte-identical to today's.

  *Check:* `packages/burgee/src/shell-word.test.ts` (new) › `R1 — PowerShell form on win32`:
  - `shellWord("it's", 'win32') === "'it''s'"`;
  - `shellWord('@a', 'win32') === "'@a'"`;
  - `shellWord('a,b', 'win32') === "'a,b'"`;
  - `shellWord('--%', 'win32') === "'--%'"`;
  - `shellWord('C:\\Users\\RUNNER~1\\x', 'win32') === "'C:\\Users\\RUNNER~1\\x'"`.

  Also `R1 — POSIX form is unchanged`, where `shellWord("it's", 'linux') === "'it'\\''s'"`.

  *Red on main:* the POSIX form comes back on `win32`, and the second argument is ignored.

- **R2 — Every `fix` word goes through it.** No other quoting of a `fix` word exists in
  `packages/burgee/src`.

  *Check:* a case in `shell-word.test.ts`, `R2 — no second quoter`. It greps
  `packages/burgee/src/**/*.ts` for the POSIX quote-escape (`'\''`, in either string
  spelling). It allows exactly:
  - `unknown-option.ts`, the one quoter;
  - `completions.ts`, `sq` at line 96, which quotes inside the generated bash, zsh and fish
    scripts. Those are POSIX by definition, and are never a `fix` line;
  - `failure-teaches.test.ts`, lines 183 and 368, where the escape appears as fixture and
    expected text (see R5).

  The allowance is by file *and* by count: one site in `completions.ts` and two in
  `failure-teaches.test.ts`. A second quoter added to an allowed file still fails.

  *Red on main:* not applicable. It holds today and must keep holding. Proven to bite by a
  mutation that adds a quoter to `surfaces.ts`.

- **R3 — It runs.** On Windows cells, a test builds a refusal whose `fix` carries `'`, `~`, `@`
  and `,`, and runs it with `pwsh -NoProfile -NonInteractive -Command`. It must exit 0, and the
  program must echo the words it received, equal to the intended argv.

  *Check:* `packages/burgee/src/fix-line-runs.test.ts` (new). It is skipped only where `pwsh` is
  absent, and fails there when `REQUIRE_SHELLS=1`. It runs through the same mechanism
  `windows-lane-holds` R3 lands (outside the parallel pool, non-interactive, with an inner
  timeout), never as a second cold `pwsh` inside the contended pool. A full Windows cell
  already pays 14–60 s for one.

  *Red on main:* a `pwsh` parse error on `windows-latest` (`'it'\''s'`).

- **R4 — Bytes measured.** The core bundle and the `.` entry are measured before and after.
  Any growth goes to a decision with the measurement. On `main` (1.3.0) the core bundle was
  24,285 B against a ceiling of 24,290 B (D-20261012-core-bundle-parse-refusals), so 5 B of
  headroom. R1's branch will almost certainly need a ruling.

  *Check:* B4's core ceiling and `weight.test.ts`.

- **R5 — Tests stop asserting one platform's output on every platform.**
  - `failure-teaches.test.ts` line 368 asserts `fix: tool fail --code=0 'it'\''s'`. It spawns
    the program, so after R1 it prints `'it''s'` on `windows-latest`. Its expected text is
    built with `shellWord("it's")`, which reads the same `process.platform` as the program
    under test.
  - Line 183 is a stub's stdout (fixture data, not output) and stays.
  - `json-failure.test.ts`'s `words` splitter (line 341) handles single quotes without
    escapes. Its cases carry no quote, so it stays, and its comment gains "neither form's
    escape is parsed here".

  *Check:* `failure-teaches.test.ts` passes on all six `compat.yml` matrix cells.

  *Red on main:* not applicable before R1. After R1 without R5, it is red on `windows-latest`,
  and the build PR shows that red.

## Design

One branch in one function. The platform is a parameter, so tests on Linux cover both forms; the
default reads `process.platform`. Callers do not change: they already map `shellWord` over a
word list.

Order:
1. R1 + R2 + R5 in one PR, with R4's measurement and ruling.
2. R3 after `windows-lane-holds` R3 has merged, so it inherits the isolated `pwsh` path.

## Verification

| R | Check | Red on main |
| :-- | :-- | :-- |
| R1 | `shell-word.test.ts` › `R1 — PowerShell form on win32`; `R1 — POSIX form is unchanged` | POSIX form on `win32` |
| R2 | `shell-word.test.ts` › `R2 — no second quoter` (allows `completions.ts:96` and `failure-teaches.test.ts:183,368` by count) | — (holds today; a mutation proves it bites) |
| R3 | `fix-line-runs.test.ts` on `windows-latest` | `pwsh` parse error |
| R4 | B4 weight axis, `weight.test.ts` | — (a measurement and a decision) |
| R5 | `failure-teaches.test.ts` on the six matrix cells | red on Windows only after R1 lands without it |

## Quint model: needed? No

A pure string function with no state, order or time. The tracker's `Q?` is `n`.

## Rejected alternatives

- **A `shell` key in the envelope.** Bytes on every failure, for a choice the platform already
  makes.
- **cmd.exe quoting.** No single rule makes every word safe there
  (D-20261012-fix-lines-shell-target).
- **Double quotes everywhere.** `$` and backticks expand inside them, in both shells.
- **Quote every word on Windows.** It would be safe, but every POSIX-safe word would change
  bytes in the Windows envelopes, for no case that needs it. A narrower set, proven in R3, is
  enough.
- **An R2 grep with no allowance.** It would fail on `completions.ts:96`, which correctly
  quotes for POSIX shells, and push someone to "fix" the bash script.

## Out of scope

- Shells a user chose over the platform default (fish, nushell). A fish user on Linux reads a
  POSIX-quoted word correctly for every word `shellWord` can produce except a `'` inside a word.
- The program word itself on Windows (`node path\to\cli.js` against a `.cmd` shim). The first
  word is the program's name as the caller typed it.

## Status

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** 2026-10-19 | `unknown-option.ts`: `shellWord(word, platform = host.platform)` (the Runtime seam's `platform`, not `process.platform`: `process-reference-lock`), and `shellLine(words)`, which every caller now uses (`failure.ts`, `surfaces.ts`, `skill-files.ts`, `init.ts`). **One departure:** callers did change. `words.map(shellWord)` hands `map`'s index in as the platform, so each `.map(shellWord).join(' ')` became `shellLine(words)` | `shell-word.test.ts` › `R1 — PowerShell form on win32`, `R1 — POSIX form is unchanged`; `completions-shells.test.ts` › `a refusal on Windows prints its fix in PowerShell quoting`. Red on `main` (`b700f4dd`): `Expected: "'it''s'"`, `Received: "'it'\''s'"`; and `Expected: "tool echo --name 'it''s' '~/x' '@a' 'a,b' --json"`, `Received: "tool echo --name 'it'\''s' '~/x' @a a,b --json"` |
| R2 | **Built** 2026-10-19 | — (a lock) | `shell-word.test.ts` › `R2 — no second quoter`. **The allowance differs from the design:** `unknown-option.ts` 1, `completions.ts` 1 (`sq`), and `shell-word.test.ts` 2 (its own POSIX pins). `failure-teaches.test.ts` is allowed none: R5 found both of its lines are program output, so both now build the expected text with `shellWord`. Proven to bite: a quoter appended to `surfaces.ts` fails it with `+ "surfaces.ts": 1` |
| R3 | **Built** 2026-10-19; **proven on CI only** (pwsh is not installed where it was built) | `completions-shells.test.ts`, which `windows-lane-holds` R3c runs after the pool and alone (the `shells` project), and `scripts/complete-pwsh.ps1` (`-Run`). **One departure:** not a new `fix-line-runs.test.ts`. The fix lines ride the *same* `pwsh` session as the PowerShell completion case (`pwshSession`), so the case adds no cold start, which on a full Windows cell costs 14–60 s. The line is a real refusal's `fix` taken with the platform read as `win32`, so it runs under Linux's `pwsh` in `completions.yml` (`REQUIRE_SHELLS=1`) and on every Windows cell of `compat.yml`. A second line runs `shellWord`'s PowerShell form of `it's`, `@a`, `a,b`, `--%`, `~`, `$HOME`, a backtick, a `RUNNER~1` path and `a b`; each must come back as typed, exit 0 | `completions-shells.test.ts` › `fix-lines-every-shell R3 — a fix line printed for Windows runs in PowerShell as printed`. Red on `main`: the refusal it runs is the POSIX form (R1's red above), which PowerShell does not parse |
| R4 | **Measured** 2026-10-19, no ruling needed | the fix-line quoting lives in the failure chunk (`unknown-option.js`), off the startup path | B4 `core-bundled-bytes` (`npm run bench -- --axis weight --check`): **24,281 → 24,265 B** against the 24,290 ceiling, with agent-lint-conformance R8 in the same branch (the shorter `describeFailure` call pays for it). `weight.test.ts`: every entry inside its budget; `.` +190 B is R8's, not this intent's |
| R5 | **Built** 2026-10-19 | `failure-teaches.test.ts` (both the unknown-command line and the unknown-option line), `json-failure.test.ts` (the comment) | The file run with `host.platform` forced to `win32`: the old file fails `gives the caller’s own line back, corrected, as the fix` and `names the whole corrected line as the fix for an unknown option`; the new one passes. The six `compat.yml` cells are the standing check |

**Built: 5 of 5.** R3's `pwsh` run is proven by CI's `completions.yml` and Windows cells, not
by a local run.
