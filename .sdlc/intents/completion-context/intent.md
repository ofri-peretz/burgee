# Intent — Completion sees the rest of the line

> Stage 1 artifact. Opened from the wave-3 ranking
> ([`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md)). A dynamic completer gets
> the partial word and nothing else, so it cannot offer values that depend on another argument.
> That is the most-commented open completion issue in yargs.

**Status:** approved — built 2026-10-20, 4 of 4 criteria evidenced below; it moves to `shipped` when the burgee minor that carries it publishes · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz · **Design:** [`spec.md`](./spec.md)

---

## What is wanted

A completer is called as `complete(partial, context)`. `context` carries the options and
positionals already typed on the line, parsed and coerced the way a run would parse them, and
the command path. A `--branch` completer can then offer the branches of the `--remote` typed
before it. A positional can declare a completer the same way. The MCP surface
gains nothing new: its arguments are not typed incrementally.

## Why now

- **Demand.** yargs #793, *"dynamic choices depending on other arg"*: open, **27 comments**,
  re-read on github.com 2026-10-12 (4 reactions in the 2026-09-05 dump). It is the
  highest-comment completion item in `.sdlc/research/issues/yargs_yargs.json`. Nearby: yargs
  #2390 (dynamic values) and #831 (per-command completion, 5 comments). Completions are a
  19-item cluster in `.sdlc/research/tracker-gap-analysis.md`.
- **The tree passes only the partial.** `completeDynamic` in
  `packages/burgee/src/complete-dynamic.ts` (lines 21–39) resolves the command, finds the
  `--option` word, and calls `complete(partial)`. Everything else on the line is dropped. A
  positional has no completer at all: zsh falls back to `_files`
  (`packages/burgee/src/completions.ts` line 169).
- **It is cheap now.** The shell scripts already call the program back (D-119). They pass the
  command path, the option and the partial (`completions.ts` line 93), and the program side
  is a parse away from using more.

## Affected users and systems

- `packages/burgee/src/complete-dynamic.ts`, `completions.ts` (the four shell scripts), and
  the `OptionSpec.complete` signature in `manifest.ts`.
- Programs that declared `complete`. Their one-argument completers keep working.

## Constraints

- **Backward compatible.** A completer that takes one parameter is called the same way.
- **Never runs the program's handler** (D-119), and never fails the shell: a completer that
  throws offers nothing, as now.
- **The partial line never errors.** A missing required option, or a value that fails
  validation, is passed as absent or as the raw string. It never becomes a usage error.

## Success criteria

1. `prog deploy --remote origin --branch <TAB>` calls the `branch` completer with
   `context.options.remote === 'origin'`.
2. A positional's completer is called for the positional under the cursor.
3. One-argument completers in the existing tests pass unchanged.
4. bash, zsh, fish and pwsh each pass the words before the cursor, held by the existing
   per-shell script tests.

## Open questions

- Whether `context` carries values that fail validation. **Answered 2026-10-12 in `spec.md`**:
  a value that fails coercion is passed as its raw string under `context.raw`, and left out of
  `context.options`.
- Whether a completer can see words after the cursor. **Answered 2026-10-12 in `spec.md`**: no,
  because bash and fish do not hand them over consistently, so offering them in one shell would
  make completers behave differently per shell.

## Status — 2026-10-20

Built on `feat/completion-context` against `main` at `24d8d8b599`, after re-grounding the spec
there ([`spec.md`](./spec.md) § Re-grounded). No criterion was met on `main`: the new
`packages/burgee/src/completion-context.test.ts` fails 29 of its 32 cases against `main`'s source.
The 2 that pass are criterion 3 and the "offers nothing" guard, and PowerShell skips without pwsh.
The constraints hold:

- **Backward compatible.** A one-argument completer is called with the same partial. A script
  generated before this change makes the same call with fewer words.
- **No handler runs and nothing errors.** A completer that throws still offers nothing.
- **The partial line never errors.** A missing required option is absent, and a value that fails
  coercion goes to `raw`.

It is a `burgee` **minor**, because `CompletionContext`, `Completer` and `ArgumentSpec.complete`
are new public API.

| Criterion | Evidence |
| :-- | :-- |
| 1. `prog deploy --remote origin --branch <TAB>` calls `branch` with `context.options.remote === 'origin'` | **Met.** `completion-context.test.ts`: `__complete deploy --remote origin --branch ''` hands the completer `{ path: ['deploy'], options: { remote: 'origin' }, positionals: [], raw: {} }`. Real bash, zsh and fish, run locally on darwin, offer `main@origin dev@origin` for that line. |
| 2. A positional's completer is called for the positional under the cursor | **Met.** Same file: `cp notes.txt <TAB>` calls `to` with `positionals: ['notes.txt']`. A variadic last positional takes every slot from its own onwards, and a slot past a non-variadic last one offers nothing. An option's value is not counted, and after `--` a dash word is a positional. bash, zsh and fish complete `cp notes <TAB>` to `bak-notes old-notes`. |
| 3. One-argument completers in the existing tests pass unchanged | **Met.** `completions-dynamic.test.ts` and `completion-flags.test.ts` pass, and their completers are untouched. One header assertion there pinned R4's old callback shape (`__complete deploy --region`), and it now checks that only the `--region` line calls back. `npm run compat`: commander **1,360 / 1,360** ▲ 0 and yargs **816 / 816** ▲ 0, both of which render completions through `completions.ts`. |
| 4. bash, zsh, fish and pwsh each pass the words before the cursor | **Met.** Each script passes `<words before the cursor> <partial>`: bash `"${words[@]:1:cword-1}"`, zsh `"${(@Q)words[1,CURRENT-1]}"` under the path above the command, fish `commandline -opc` without the program, PowerShell `@words`. The real-shell cases run in `completions.yml` (`REQUIRE_SHELLS=1`, where pwsh is the shell checked on CI only). In-process assertions hold the same lines for the mutation lane, which has no zsh or fish. |

Changed-line mutation, `scripts/mutation.ts changed`: **229 of 229 mutants detected** (228
killed, 1 timed out), 0 survivors, in 5.78 minutes locally, under the lane's 11-minute budget. Three equivalent mutants
are disabled, each with its reason on the line. `context.qnt` `safety` holds over 20,000
traces × 30 steps. Its five rejected designs and its witness are violated, and `models.yml` checks
all six. Weight: burgee's B4 bundle reads **24,431 B**, the same as `main`, because nothing
reaches the startup path. `./completions` stays within its 16,000 B budget: minified it went from
9,203 to 10,063 B. `complete-dynamic.js`, which loads only on `__complete`, went from 513 to
3,452 B minified, because it now reaches the coercion in `validate.js`. The tarball is within
`artifact-size-baseline.json`. No budget moved, so no decision was needed.
