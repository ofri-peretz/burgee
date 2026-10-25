# Design — Completion sees the rest of the line

Intent: [`intent.md`](./intent.md). **Status:** shipped 2026-10-25 in burgee 1.7.0 (Version PR #1231) — re-grounded on `main` at
`24d8d8b599` and built 2026-10-20 (below).

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

## Re-grounded on `main` at `24d8d8b599`, 2026-10-20

The design above was written on 2026-10-12 and accepted then. Read again before building, its
premises hold: `completeDynamic` still calls `complete(partial)` and drops the rest of the line
(`complete-dynamic.ts` lines 21–40), zsh still gives every positional `'*: :_files'`
(`completions.ts` line 181, not 169), and the callback still passes only the path, the option and
the partial (`completions.ts` line 104, not 93). No criterion was already met on `main`:
`completion-context.test.ts` fails 19 of its 22 cases against `main`'s source. The two that pass
are criterion 3 (one-argument completers) and the "offers nothing" guard. The third is
PowerShell, which skips without pwsh.

Building it changed seven details. None of them moves a requirement:

1. **R2's coercion reuses `coerce` from `validate.ts`, one key at a time**, not "the per-type
   functions". A run's numbers, choices and Standard Schema are applied in one place. A key that
   throws goes to `raw`, so one bad value costs only itself.
2. **`context` holds only what was typed.** No env, config or default is read on TAB. They are not
   on the line, and reading config files at every key press is the cost D-119 refused. The doc
   comment on `CompletionContext.options` says so.
3. **The option the cursor is on is not in `context.options`.** `parseArgs` reports a trailing
   `--branch` as `branch: true`. The fold leaves it out (the model's `stepFoldTrailing`).
4. **An empty last word may be missing.** An older PowerShell (before 7.3) drops an empty argument
   to a native command, so the call can end on the option itself. A last word that names a valued
   option is read as "the cursor is on its value, and nothing is typed". A script generated
   before this change always ended on the option or its partial, so it needs nothing else.
5. **zsh's words are shifted.** A command's function runs after its parent's `*::` state, so
   `words[1]` is the command's own word and not the program. The script spells the path above it
   and passes `"${(@Q)words[1,CURRENT-1]}"`. The root passes `words[2,CURRENT-1]`. fish removes
   the program from `commandline -opc`. PowerShell passes `$words` and now trims the word under
   the cursor with `Select-Object -First`. `$words[0..($words.Count - 2)]` read
   `$words[0..-1]` for one word, which repeats it.
6. **The header says so.** A script whose program has a positional completer says it "runs
   `<program>` on TAB only for the options and arguments that declare a completer". The old
   sentence stays for a program whose only completers are on options.
7. **Checks moved.** R1–R3 and R4's real-shell cases are in `completion-context.test.ts`, not
   `completions-dynamic.test.ts`. That file's header test pinned R4's old shape
   (`__complete deploy --region`), so it now checks that the `--region` line calls back and the
   `--tier` line does not, which is what it was about. `ArgumentSpec.complete` is a type, held by
   the typecheck of that test file, so `definition.test.ts` needed no case. R2 has a state machine
   in it, so it has a model: [`context.qnt`](./context.qnt), checked in `models.yml` with five
   rejected designs and a witness.

### The model

`context.qnt` types a line one piece at a time: an option with its value, a boolean or its
negation, a positional, `--`, or a valued option with the cursor after it. It records what the
person meant and checks the scanner `__complete` runs against it. `safety` (`sameTarget`,
`samePositionals`, `sameOptions`, `sameRaw`) holds over 20,000 traces × 30 steps. Each rejected
reading is a step that CI requires to violate it:

| step | the reading it rejects |
| :-- | :-- |
| `stepCountValues` | an option's value counted as a positional too, so the slot is off by one |
| `stepFoldTrailing` | the option awaiting its value folded in as `true`, as `parseArgs` reports it |
| `stepFirstWins` | a boolean that keeps its first spelling, so `--force --no-force` reads `true` |
| `stepKeepStale` | a failed value put in `raw` while the earlier good one stays in `options` |
| `stepFlagsAfterEnd` | a word after `--` still read as an option |

`rawNeverHolds` is the witness and must also be violated: some line puts a failed value in `raw`.
