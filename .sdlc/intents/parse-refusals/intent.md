# Intent — A native command refuses input it would otherwise drop

> Stage 1 artifact. Opened from the wave-3 ranking
> ([`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md)). Two inputs that a native
> burgee command accepts and silently loses: a positional nobody declared, and the first value
> of a single-value flag given twice.

**Status:** approved · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

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

## Open questions

- Whether this is a breaking change for 1.x programs. **Answered 2026-10-12 in `spec.md`**: it
  ships as a minor with a changeset that says what used to be dropped. The input it refuses was
  never delivered to the program, so no working program loses data. `allowExcess` is the escape
  hatch for a program that relied on the drop.
- Whether the same value twice is an error. **Answered 2026-10-12 in `spec.md`**: no, because
  nothing is lost.
