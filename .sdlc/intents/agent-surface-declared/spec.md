# Design — a command's agent surface is declared, never forgotten

Intent: [`intent.md`](./intent.md). **Status:** approved.

---

## Requirements

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** | `effects` is required on a runnable command; `definition.ts` refuses one without it | `effects.test.ts` — the refusal, proven red on the unfixed tree |
| R2 | **Built** | `effects: 'withheld'` is the opt-out — a value an author writes | `mcp.test.ts` — a `'withheld'` command defines cleanly |
| R3 | **Built** | `'withheld'` is absent from `tools/list` and published as `"withheld"` in `--schema` | `mcp.test.ts` |
| R4 | **Built** | the refusal names the command and every remedy | `mcp.test.ts` asserts the message |
| R5 | **Built** | a group (subcommands, no handler) is not asked | `mcp.test.ts` |
| R6 | **Built** | restated by what shipped (D-127): both façades carry `.effects()` — `Command.prototype.effects` in `commander/command.ts`, `YargsInstance.effects` in `yargs/factory.ts` — and each projects the declaration onto the manifest node. A façade command that declares nothing is **listed** as `effects: 'undeclared'` with no hints, rather than withheld, so no incumbent program loses tools by switching; declaring one adds the MCP hints; `.effects('withheld')` keeps it out. Neither passes `defineCommand`'s door, so neither is *refused* for declaring nothing — the incumbents' own suites declare none, and that is why they stay at 1360 / 1360 and 804 / 804 | `facade-surface.test.ts`, `yargs/burgee.test.ts`, `npm run compat` |

## Design

**`effects: 'withheld'` — a fourth value of the same field, and `effects` becomes required.**

**Not `'none'`.** That was the first spelling and it is wrong: *none* reads as *this command
has no effects*, which is `read_only` — the one value it could be confused with, and the only
confusion that would matter.

**Not a second boolean field.** Beside a now-required `effects`, an `agent: false` would mean
that declaring what a command does to the world **silently opts it into the tool list**, and
the new field's default would be the exact silence this change removes.

One field, four answers, **no default** — so there is no state in which forgetting is
possible. That is why `toolsOf`'s filter did not have to become less strict for the failure to
become loud: the filter still excludes anything that is not one of the three acting values,
and nothing can now reach it un-annotated.

`checkCommand` takes `effects` and `runs` as **required parameters**. An optional check is one
a caller declines by writing nothing, which is the shape of the original defect.

**Where the refusal is not, and why.** It was first built as a guard at `--mcp` startup, so a
CLI that never serves an agent would pay nothing. That version is discarded: it leaves
forgetting possible and only catches it later, and burgee's whole premise is that every CLI
it builds is agent-reachable. Requiring the field is the stricter and simpler rule — and the
migration is one word per command, which is what the eighteen fixtures in this package
demonstrate.

## Verification

`npx vitest run --root packages/burgee mcp` — nine cases, **six red on the unfixed tree**: the
refusal did not fire; the message was empty; a bad spelling was accepted; a lazy node was
accepted; `'withheld'` was **served as a tool** with `destructiveHint: false`; and a plugin
command with no effects was admitted. The three that passed had to — `--schema` already
carried the value through, and the completions never read it.

The check that would have caught the original: **there wasn't one, and that is the finding.**
Nothing asserted that a command reaching `tools/list` was a command the author meant to
publish, so the gap survived from `cli-mcp` shipping until now.

## Rejected alternatives

- **A warning at startup instead of a definition-time throw.** A warning on stderr is read by
  nobody in an agent transport, where stdout is JSON-RPC and stderr is a log the client
  usually discards. It would have moved the failure from silent to nearly silent.
- **A guard at `--mcp` startup rather than at definition.** Built first, then discarded: it
  costs a non-MCP CLI nothing, but it leaves forgetting possible right up until someone
  serves, and it makes the field optional again in everything but name.
- **Defaulting to `non_idempotent`.** It makes every un-annotated command a *destructive tool*
  — strictly worse than absent, and exactly what MCP's own `destructiveHint` default is
  guarding against.
- **`agent: false` as a separate field.** Two spellings of one fact; see Design.

## Out of scope

Per-command authorisation — *whether a caller is allowed* rather than *what the command does*.
That is the permissions design, it builds on this one, and conflating them is the mistake this
repository has avoided so far.
