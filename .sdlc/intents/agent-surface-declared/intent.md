# Intent — a command's agent surface is declared, never forgotten

**Status:** shipped · **Opened:** `2026-09-17` · **Owner:** `@ofri-peretz` · **Shipped:** 2026-10-18 on [`1013b65db5`](https://github.com/ofri-peretz/burgee/commit/1013b65db5), verified against `main` at `1013b65db5` — all 4 criteria locked by `mcp.test.ts`, `facade-surface.test.ts` and `yargs/burgee.test.ts`

---

## What is wanted

A command that does not say what it does to the world **fails when it is defined**, not
silently at `tools/list`. Declining to expose a command to an agent stays possible and
becomes something an author *says*, so the two outcomes stop looking identical.

## Why now

`.sdlc/intents/burgee/spec.md` has carried N6 as `Not built` with the cause in its own
words:

> **N6** — `effects` is optional, not required. A command that omits it is silently not
> served as a tool rather than failing at definition time, **which is the quieter of the
> two failures.**

Confirmed on `main`, 2026-09-17 — `packages/burgee/src/mcp.ts`:

```ts
runnable(manifest).filter((c): c is CommandNode & { effects: Effects } => c.effects !== undefined)
```

The filter is right and stays. `mcp.ts`'s own header says why: *"an agent gaining
shell-equivalent power over a CLI nobody meant to publish is a security posture, not a
convenience."* What is wrong is that **forgetting** and **declining** produce the same
result. A consumer builds a command for an agent, ships, and the tool is not there — with no
error at build time, no warning at startup, and nothing in `--schema` to notice.

It is the first thing a real consumer hits after `--mcp` works at all, and the failure is
silent in the direction that wastes their afternoon.

## Affected users and systems

`packages/burgee` — `definition.ts`, `manifest.ts`, `mcp.ts`, `schema.ts`, the Fig
projection. Every CLI built on burgee with an un-annotated runnable command: **this is a
breaking change** and the changeset says so in those words.

## Constraints

- **The MCP filter does not loosen.** Silence must never become exposure; that trade is the
  security posture the module was written around.
- **Declining must remain first-class.** A CLI with commands no agent should call is a
  normal CLI, not a misconfigured one.
- commander **1360 / 1360** and yargs **804 / 804** do not move. Both incumbents' suites
  define commands with no `effects`, so if the definition-time refusal reaches a graded case,
  the design bends and the number does not.
- No new error vocabulary: the refusal uses the shape `checkRelationNames` already uses.

## Success criteria

1. A runnable command with neither `effects` nor the explicit opt-out throws at definition
   time, naming the command and every way to fix it.
2. The opt-out is `effects: 'withheld'` — a value an author writes — and a command carrying it
   is absent from `tools/list` while publishing `"withheld"` in `--schema`.
3. `npm run compat` — every row `▲ 0`.
4. burgee's design records N6 as built, and the claim is checked by a test that fails on the
   unfixed tree.

## Shipped — 2026-10-18

**Status raised to `shipped`.** Every criterion was checked against `main` at `1013b65db5` in the
roadmap-to-shipped Batch 0 pass (`.sdlc/research/roadmap-to-shipped-2026-10.md`).

`spec.md`'s R1 cited `effects.test.ts`, which does not exist. The refusal is in `mcp.test.ts`,
and the citation is corrected in this PR.

| criterion | check | result |
| :-- | :-- | :-- |
| 1. a runnable command with neither `effects` nor the opt-out throws, naming it and every fix | `mcp.test.ts` › `a runnable command declares its effects, or declines out loud (N6)` | 9 passed, 31 skipped |
| 2. `effects: 'withheld'` is absent from `tools/list` and published in `--schema` | `mcp.test.ts` › `lists exactly the commands the author did not withhold…` | 1 passed, 39 skipped |
| 3. `npm run compat`, every row ▲ 0 | `npm run compat -- commander yargs` | commander 1360 / 1360, yargs 816 / 816 |
| 4. N6 recorded as built, with a check red on the unfixed tree | burgee `spec.md` N6; R6 for the façades: `facade-surface.test.ts -t G1/G2` | 5 passed, 26 skipped |

## Open questions

None open. Two were resolved while building and both are recorded in `spec.md`: the opt-out
is a fourth value of `effects` rather than a separate field, and it is spelled `'withheld'`
rather than `'none'` — *none* reads as *no effects*, which is `read_only`.

One limit is **not** a question but a stated gap: a `burgee/commander` or `burgee/yargs`
command reaches the manifest through `Manifest.add()` without passing `defineCommand`'s door,
so a façade user's command is withheld in fact and cannot be made to say so. It is why both
incumbents stay at 1360 / 1360 and 804 / 804 through this change, and it is R6 of the design.
