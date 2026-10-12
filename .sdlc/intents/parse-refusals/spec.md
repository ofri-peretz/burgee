# Design — A native command refuses input it would otherwise drop

Intent: [`intent.md`](./intent.md). **Status:** approved.

**Accepted by the owner, 2026-10-12, by instruction: create and execute.** The instruction and the
evidence are recorded in [`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md).

---

## Requirements

- **R1 — Excess positionals are a usage error.** After `requirePositionals`, a count above the
  declared arguments, when the last one is not variadic, throws
  `UsageError('too many arguments: expected N, got M ("extra")')`. The surplus words are quoted.
- **R2 — `allowExcess` opts out.** `CommandNode.allowExcess?: boolean`, accepted by the
  definition check, shown in `--schema` as `excess: true`. With it the surplus reaches
  `ctx.positionals`, as today.
- **R3 — A conflicting repeat is a usage error.** Using the `tokens` `parseArgs` already
  returns, a non-`multiple` option seen twice with different values throws
  `UsageError('--level was given twice: "info" and "debug"')`. The same value twice passes.
  A value from env or config never conflicts with a flag: precedence decides that, as now.
- **R4 — Both errors are recoverable in one turn.** The envelope's `next[]` carries the command
  with the surplus removed (R1), or with the last value kept (R3).

## Design

Both checks sit in `execute.ts` beside `requirePositionals`, after parse and before relations,
so a refusal never reaches a handler. R3 reads `parsed.tokens` with no second parse. The `next[]`
is built from the same argv the failure already echoes (`failure.ts`).

Order: R1 and R2 in one PR, then R3 and R4.

## Verification

| R | Check | Shown failing first by |
| :-- | :-- | :-- |
| R1 | `packages/burgee/src/parse-refusals.test.ts` (new): one-argument command, two words | today exit 0 and the word is gone |
| R2 | the same file: `allowExcess: true` keeps both words; `schema.test.ts` shows `excess` | the definition check rejects the unknown key |
| R3 | the same file: `--level a --level b` is exit 2; `--level a --level a` is exit 0 | today exit 0 with `level: 'b'` |
| R4 | `json-failure.test.ts`: each `next[]` re-run exits 0 | today no failure, so no `next[]` |
| façades | `npm run compat -- commander yargs` | unchanged grades |

## Rejected alternatives

- **Warn on stderr and continue.** An agent reads the exit code and the envelope. A warning
  keeps the failure invisible to exactly the caller it hurts.
- **Make the last repeat win, and document it.** That is today's behaviour. yargs #1318 shows
  people treat it as a bug, and an agent constructing argv by appending will hit it.
- **Ship it behind an opt-in.** The defect is silent, so an opt-in reaches only the authors who
  already know about it.

## Out of scope

- The commander and yargs façades, whose behaviour is the incumbent's.
- Unknown options. `strict: true` already refuses them.
- Boolean flags given twice. There is no value to lose.
