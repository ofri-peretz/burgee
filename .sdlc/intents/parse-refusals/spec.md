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

## Status

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** 2026-10-12 | `parse-refusals.ts` (`refuseDropped`), one chunk with the missing-argument check that was `execute.ts`'s `requirePositionals`. `execute.ts` imports it where that check ran, after the values are checked and before the handler, only when the count of positionals is not the declared one or there are more option tokens than parseArgs value keys (`mayRefuse`). So the order of today's refusals is unchanged, and the design's "before relations" is not kept: a relation error on the same line is named first. `.` 35,553 B of its unchanged 35,681 (#1044 had left 137 B; moving the missing-argument check out paid for the gate). The package tarball is 247,749 B gzipped against the 247,805 that `artifact-size-baseline.json` allows | `parse-refusals.test.ts` › `R1 — …`. Red: `expected +0 to be 2` (`greet ada extra` ran, `extra` gone), and `expected '' to contain 'too many arguments: expected 1, got 3…'` |
| R2 | **Built** 2026-10-12 | `Command.allowExcess` and `CommandNode.allowExcess`, copied by `NODE_KEYS`; `schema.ts` publishes `excess: true`. Both messages are `messages.ts` catalog entries (`usage.tooManyArguments`, `usage.givenTwice`), so a locale pack translates them (#1044). The bytes came from folding `schemaOf`'s and `summaryOf`'s shared tail into `withProgram`: `./mcp` had 5 B of headroom and is 26,695 → 26,560 B | `parse-refusals.test.ts` › `R2 — …`; `schema.test.ts` › `says excess: true …`; `stdin-dash.test.ts` › `leaves - alone past the declared arguments …`. Red: `TS2353: 'allowExcess' does not exist in type 'Command<…>'`, and `expected undefined to be true` |
| R3 | **Built** 2026-10-12 | `parse-refusals.ts`, from `parsed.tokens` with no second parse. Flag tokens only, so env and config never conflict with a flag. A `multiple` option and a boolean are never refused | `parse-refusals.test.ts` › `R3 — …`. Red: `expected +0 to be 2` (`level: 'debug'`, `info` gone) |
| R4 | **Built** 2026-10-12, **as `fix`, not `next[]`** | `failure.ts` (`carried`): the refusal names the words to leave out (`omit`, counted from the line's end) and the failure path writes the line as typed without them, quoted with `shellWord` like every `fix:`. A usage error's runnable correction is `fix` (E3); `next[]` is the `action_required` envelope's (N11), which a usage error does not use, so a second field was not added. The fix is omitted rather than guessed when one word was read as two flags (`-vl x`) or a global flag left the words the parser read | `json-failure.test.ts` › `parse-refusals R4: …` (each refused line's `fix` is run and exits 0); `parse-refusals.test.ts` › `R4 — …`. Red: `expected +0 to be 2`: no failure, so no line to run |

**Built: 4. Not built: 0.**

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
