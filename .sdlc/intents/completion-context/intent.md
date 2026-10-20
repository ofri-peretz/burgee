# Intent — Completion sees the rest of the line

> Stage 1 artifact. Opened from the wave-3 ranking
> ([`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md)). A dynamic completer gets
> the partial word and nothing else, so it cannot offer values that depend on another argument.
> That is the most-commented open completion issue in yargs.

**Status:** approved · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

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
