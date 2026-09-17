# Intent — a command's agent surface is declared, never forgotten

**Status:** approved · **Opened:** `2026-09-17` · **Owner:** `@ofri-peretz`

---

## What is wanted

A command that does not say what it does to the world **fails when it is defined**, not
silently at `tools/list`. Declining to expose a command to an agent stays possible and
becomes something an author *says*, so the two outcomes stop looking identical.

## Why now

`.sdlc/intents/burgee/design.md` has carried N6 as `Not built` with the cause in its own
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

## Open questions

None open. Two were resolved while building and both are recorded in `design.md`: the opt-out
is a fourth value of `effects` rather than a separate field, and it is spelled `'withheld'`
rather than `'none'` — *none* reads as *no effects*, which is `read_only`.

One limit is **not** a question but a stated gap: a `burgee/commander` or `burgee/yargs`
command reaches the manifest through `Manifest.add()` without passing `defineCommand`'s door,
so a façade user's command is withheld in fact and cannot be made to say so. It is why both
incumbents stay at 1360 / 1360 and 804 / 804 through this change, and it is R6 of the design.
