# Intent — a `fix:` line runs as written in the shell it was printed for

> Stage 1 artifact. Opened from the wave-4 ranking
> ([`next-wave-4-2026-10.md`](../../research/next-wave-4-2026-10.md)) to close gap
> `B-20261012-fix-lines-quote-for-posix-only`.

**Status:** review · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

---

## What is wanted

Every `fix:` line burgee prints (unknown option, unknown command, the parse refusals, `burgee
skill --check`) is quoted for the platform's default shell: POSIX `sh` off Windows, PowerShell on
Windows. Pasted or run there, it runs as written.

## Why now

- **The gap.** `shellWord` (`packages/burgee/src/unknown-option.ts` line 73) writes a single quote
  inside a word as `'\''`, which is POSIX-only; PowerShell reads it as a syntax error. Windows
  paths such as CI's `C:\Users\RUNNER~1\…` reach it through `skill-files.ts`.
- **Who it hurts.** An agent on Windows retries with the `fix` it was given; a line that does not
  parse costs it a turn and a wrong conclusion. The `fix` contract (E3, D-20260930-failures-teach-recovery)
  promises a line that runs.
- **The target is decided.** D-20261012-fix-lines-shell-target.

## Affected users and systems

- `unknown-option.ts` (`shellWord`), and its callers `failure.ts`, `surfaces.ts`,
  `skill-files.ts`. Every native program and both façades' refusals on Windows.

## Constraints

- **POSIX output is byte-identical.** Every existing `fix` test passes unchanged off Windows.
- **No new envelope key.**
- **Core bundle.** `shellWord` is in the core graph; any growth is measured and ruled on, never
  absorbed silently (B4's core ceiling, D-20261012-core-bundle-parse-refusals).

## Success criteria

1. On `win32`, `shellWord("it's")` is `'it''s'`, and a line with it runs in `pwsh -Command`.
2. The Windows cells of `compat.yml` run a `fix` line through `pwsh` and exit 0.
3. The gap is closed.

## Jev triage

| user_impact | incumbent_gap | risk_reduced | composite | ready_for_spec | needs_model |
| --: | --: | --: | --: | :-- | :-- |
| 1 | 2? | 2 | 11 | yes | no |

## Open questions

- Which shell a line targets. **Decided 2026-10-12**, D-20261012-fix-lines-shell-target.
