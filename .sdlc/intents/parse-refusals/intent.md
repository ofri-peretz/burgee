# Intent — A native command refuses input it would otherwise drop

> Stage 1 artifact. Opened from the wave-3 ranking
> ([`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md)). Two inputs that a native
> burgee command accepts and silently loses: a positional nobody declared, and the first value
> of a single-value flag given twice.

**Status:** shipped · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz · **Shipped:** 2026-10-18 on [`1013b65db5`](https://github.com/ofri-peretz/burgee/commit/1013b65db5), verified against `main` at `1013b65db5` — all 4 criteria locked by `parse-refusals.test.ts` and `json-failure.test.ts`

---

## What is wanted

A native command (`defineCommand`, `defineProgram`) gives a usage error, exit 2, when:

1. **More positionals arrive than it declares.** `deploy prod extra` against a command that
   takes one argument names `extra` in the error, as commander 15 does. A variadic last argument
   still takes the rest.
2. **A single-value option is given twice with different values.** `--level info --level debug`
   on an option that is not `multiple` names both values. Repeating the same value stays
   accepted, so a wrapper script that appends a default is not broken.

Each error carries the `kind` and the runnable `next[]` every usage error already carries, so an
agent's retry is one turn.

## Why now

- **The behaviour today.** `requirePositionals` in `packages/burgee/src/execute.ts` (line 500)
  checks for too few positionals and never for too many. `parseArgs` runs with
  `allowPositionals: true` (line 456) and no maximum, so a surplus word is dropped. A repeated
  scalar flag keeps the last value, because `node:util`'s `parseArgs` does so for a
  non-`multiple` option.
- **Demand.**
  - yargs #1076, *"Strict mode not working for positional arguments"*: open, 4 comments,
    re-read on github.com 2026-10-12, and 9 reactions in the 2026-09-05 dump
    (`.sdlc/research/issues/yargs_yargs.json`).
  - yargs #1318, repeated scalar options: open, 9 comments, re-read 2026-10-12, and 12
    reactions in the dump.
  - The parser list in `.sdlc/research/tracker-gap-analysis.md` ("boolean arity … array
    semantics") names both as correctness items a new parser can satisfy on day one.
- **The incumbent already moved.** Commander 15 names the surplus argument in its
  excess-arguments error (`packages/burgee/src/compat.ts` lines 189–190). The commander drop-in
  does this, and native burgee, the API recommended for new programs, does not.
- **For an agent a silent drop is the worst outcome.** The call reports success with the wrong
  input, so nothing triggers a retry. `agent-headroom` measures hangs and wrong exit codes; this
  is the same class of defect, and it reaches the agent with exit 0.

## Affected users and systems

- `packages/burgee/src/execute.ts` (parse and validation), `failure.ts` (the error's `next[]`).
- Every native program. The commander and yargs façades are untouched: their behaviour is the
  incumbent's and is graded.

## Constraints

- **Additive to the exit-code contract.** Both are exit 2, `UsageError`, an existing code.
- **A command can opt out.** `allowExcess: true` on a command keeps today's behaviour for one
  that forwards its tail to a child process.
- **The graded façades do not change.**

## Success criteria

1. `demo greet ada extra` exits 2, and the message names `extra`.
2. `--level a --level b` exits 2 and names both values. `--level a --level a` exits 0.
3. A command with `allowExcess: true` behaves as today.
4. `npm run compat -- commander yargs` is unchanged.

## Shipped — 2026-10-18

**Status raised to `shipped`.** Every criterion was checked against `main` at `1013b65db5` in the
roadmap-to-shipped Batch 0 pass (`.sdlc/research/roadmap-to-shipped-2026-10.md`).

| criterion | check | result |
| :-- | :-- | :-- |
| 1. surplus positional exits 2 and names it | `parse-refusals.test.ts` (R1) | 35 passed (with `schema.test.ts`, `stdin-dash.test.ts`) |
| 2. a conflicting repeat exits 2 naming both; a same-value repeat exits 0 | `parse-refusals.test.ts` (R3) | the same run |
| 3. `allowExcess: true` behaves as before | `parse-refusals.test.ts` (R2), `schema.test.ts` (`excess`) | the same run |
| 4. compat unchanged | `npm run compat -- commander yargs` | commander 1360 / 1360, yargs 816 / 816 |

The retry line is a `fix`, not the `next[]` that "What is wanted" names. R4 shipped that way
(spec, R4 row): the words to leave out are dropped from the line as typed, quoted like every
`fix:`. `json-failure.test.ts -t "parse-refusals R4"`, which re-runs the fix and expects exit 0:
7 passed, 48 skipped.

## Open questions

- Whether this is a breaking change for 1.x programs. **Answered 2026-10-12 in `spec.md`**: it
  ships as a minor with a changeset that says what used to be dropped. The input it refuses was
  never delivered to the program, so no working program loses data. `allowExcess` is the escape
  hatch for a program that relied on the drop.
- Whether the same value twice is an error. **Answered 2026-10-12 in `spec.md`**: no, because
  nothing is lost.
