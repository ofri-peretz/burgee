# Intent — a `fix:` line runs as written in the shell it was printed for

> Stage 1 artifact. Opened from the wave-4 ranking
> ([`next-wave-4-2026-10.md`](../../research/next-wave-4-2026-10.md)) to close gap
> `B-20261012-fix-lines-quote-for-posix-only`. Refreshed 2026-10-18 against `main` at
> `1013b65db5`.

**Status:** approved · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

**Remaining (2026-10-19):** all five requirements are built. Criterion 1's second half and criterion 2 are a `pwsh` run, which only CI has: `completions-shells.test.ts` › *fix-lines-every-shell R3* on `completions.yml` (Linux `pwsh`, `REQUIRE_SHELLS=1`) and on the Windows cells of `compat.yml`. Shipped once those run it green.

---

## What is wanted

Every `fix:` line burgee prints is quoted for the platform's default shell: POSIX `sh` off
Windows, PowerShell on Windows. That covers unknown option, unknown command, the parse refusals
and `burgee skill --check`. Pasted or run in that shell, the line runs as written.

## Why now

- **The gap.** `shellWord` (`packages/burgee/src/unknown-option.ts` line 73) writes a single
  quote inside a word as `'\''`, which only POSIX shells read. PowerShell reads it as a syntax
  error. Windows paths such as CI's `C:\Users\RUNNER~1\…` reach it through `skill-files.ts`.
- **Every caller goes through that one function.** `failure.ts` line 118 (the parse-refusal
  `fix`), `surfaces.ts` line 371 (unknown command), `skill-files.ts` line 56 (`skill --check`)
  and `unknown-option.ts` line 115. Nothing else in `packages/burgee/src` quotes a `fix` word.
  One other site writes `'\''`: `completions.ts` line 96 (`sq`), which quotes words *inside the
  generated bash, zsh and fish scripts*. Those are POSIX by definition and are not `fix` lines.
- **Who it hurts.** An agent on Windows retries with the `fix` it was given. A line that does
  not parse costs it a turn and a wrong conclusion. The `fix` contract (E3,
  D-20260930-failures-teach-recovery) promises a line that runs.
- **The target is decided.** D-20261012-fix-lines-shell-target.

## Affected users and systems

- `unknown-option.ts` (`shellWord`), and its callers `failure.ts`, `surfaces.ts` and
  `skill-files.ts`. Every native program, and both façades' refusals, on Windows.
- Tests that pin the POSIX form as if every platform printed it:
  `packages/burgee/src/failure-teaches.test.ts` line 368 (`'it'\''s'`), and the `words`
  splitter in `json-failure.test.ts` line 341.

## Constraints

- **POSIX output is byte-identical.** Every existing `fix` test passes unchanged off Windows.
- **No new envelope key.**
- **Core bundle.** `shellWord` is in the core graph. Any growth is measured and ruled on, never
  absorbed silently (B4's core ceiling, D-20261012-core-bundle-parse-refusals).
- **Windows `pwsh` time is scarce.** A `pwsh` spawn on a full Windows cell costs 14–60 s today
  (`windows-lane-holds`). R3 here rides that intent's R3 mechanism, or follows it.

## Success criteria

1. On `win32`, `shellWord("it's")` is `'it''s'`, and a line containing it runs in
   `pwsh -Command`.
2. The Windows cells of `compat.yml` run a `fix` line through `pwsh` and exit 0.
3. The gap is closed.

## Jev triage

| user_impact | incumbent_gap | risk_reduced | composite | ready_for_spec | needs_model |
| --: | --: | --: | --: | :-- | :-- |
| 1 | 2? | 2 | 11 | yes | no |

## Open questions

- Which shell a line targets. **Decided 2026-10-12**, D-20261012-fix-lines-shell-target.
- Whether PowerShell needs quoting for words POSIX leaves bare. **Answered 2026-10-18 in
  `spec.md`**: yes, for a leading `@`, a `,`, and the token `--%`. R1 covers them, and R3 proves
  them in `pwsh`.
