# Design — Completion sees the rest of the line

Intent: [`intent.md`](./intent.md). **Status:** approved.

**Accepted by the owner, 2026-10-12, by instruction: create and execute.** The instruction and the
evidence are recorded in [`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md).

---

## Requirements

- **R1 — The completer's second argument.** `complete(partial, context)`, where `context` is
  `{ path: string[], options: Record<string, unknown>, positionals: string[], raw: Record<string, string> }`.
- **R2 — A lenient parse of the line.** `__complete` parses the words before the cursor with
  the command's specs. It uses `strict: false`, skips required-option and relation checks, and
  coerces each value. A value that fails coercion goes into `raw`, not `options`.
- **R3 — Positionals complete too.** `ArgumentSpec.complete` takes the same signature as an
  option's. The completion target is the option whose value is being typed, or the positional
  slot the cursor is in, counted against the command's declared arguments. zsh keeps `_files`
  for a `type: 'file'` argument and for one with no completer.
- **R4 — Every shell passes the words before the cursor.** Today the callback passes the
  command path, the `--option` and the partial (`completions.ts` line 93). The bash, zsh, fish
  and pwsh scripts each forward the words before the cursor instead: `COMP_WORDS` up to
  `COMP_CWORD`, `words[1,CURRENT-1]`, `commandline -opc`, and the command AST's elements. The
  shape is the same in all four.

## Design

`completeDynamic` gains one pass: slice argv at the cursor, run `parseArgs` with `strict:
false` and `tokens: true`, and fold the tokens into `context`. Coercion reuses `validate.ts`'s
per-type functions and swallows their errors into `raw`. The calling convention stays
`<program> __complete <words…>`, so scripts generated before this change keep completing
options. They just pass fewer words.

Order: R1 and R2 in one PR, then R3, then R4.

## Verification

| R | Check | Shown failing first by |
| :-- | :-- | :-- |
| R1, R2 | `packages/burgee/src/completions-dynamic.test.ts`: the `--branch` completer receives `remote: 'origin'`; a bad number lands in `raw` | today the completer is called with one argument |
| R3 | the same file: the second positional's completer is called for `prog cp a <TAB>`; `definition.test.ts` accepts `complete` on an argument | today `completeDynamic` returns when no `--` word is present, and `ArgumentSpec` has no `complete` |
| R4 | `completions.test.ts` and `completions-edges.test.ts`: each of the four scripts passes the prior words | written first against today's scripts, which pass only path, option and partial |
| compat | the one-argument completers in `completion-flags.test.ts` | unchanged |

## Rejected alternatives

- **A separate `completeWith(context)` hook.** A second hook beside `complete` means two names
  for one job. An optional second parameter costs a caller nothing.
- **Run full validation on the partial line.** The line is unfinished by definition. A missing
  required flag is the normal state while typing.
- **Ship words after the cursor in zsh only.** Completers would behave differently by shell,
  and the bug report would name the program rather than the shell.

## Out of scope

- Fig. It is generated from the static manifest only.
- Caching completer results between key presses.
