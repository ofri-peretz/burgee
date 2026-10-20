---
id: D-20261020-default-command-design-accepted
subject: 'default-command: is the Stage 2 design accepted for Build, or is a default command not worth its bytes?'
taken: 'Accepted — by the batch-22 agent under the owner''s delegation of design gates (burgee-owner-delegates-tradeoffs, 2026-10-12)'
date: '2026-10-20'
superseded_by: —
---

**Accepted. [`default-command/spec.md`](../intents/default-command/spec.md) (R1–R5), as re-grounded
on `main` at `ed14fd92c2`, is the design Build implements, and the intent moves
`review → approved`.** Taken under the owner's delegation of Design→Build accepts; the shape itself
was settled earlier in D-20261012-default-command-shape.

**Why build it rather than drop it.** It is the native API's one parity gap that both incumbents
close. commander has `isDefault` and yargs has `$0` / `*`, and both façades already grade them
against the incumbents' own suites. A program written against `defineProgram`, which is the API
burgee recommends for new programs, could not do it at all: `tool` alone was root help and exit 2,
and the workaround was a command name the user had to type. yargs #1331 (4 reactions, 16 comments)
asks for the part neither incumbent does well, which is the default's examples and usage in root
help. The façades need nothing from this work, because they dispatch their own defaults, so
compatibility does not require it. The native API does.

**Why it is cheap enough.** Re-grounding put almost all of it off the startup path:

- dispatch is one `Again` line in `unresolved` (`surfaces.js`), which is loaded only when argv
  resolves no runnable command;
- help's composition (the default's arguments, options and examples at its parent) is in
  `surfaces.js`, and only the `(default)` mark and `[command]` are in the `./help` door;
- completions read the key in their own chunk.

What the startup path pays is one key in `NODE_KEYS` (+10 B bundled), and `defineProgram` pays
the check for two defaults at one level. The measured cost and the two ceilings it moves are in
D-20261020-default-command-weight. No claim ratchet moves: `burgee ÷ cac` reads 2.343 against
2.35, and `burgee/commander ÷ commander` 1.415 against 1.42.

**What the re-grounding changed.** Every change is in the spec's *Re-grounded 2026-10-20*
section. The duplicate check is in `defineProgram`'s tree walk and not in `definition.ts`, which
every front-end loads. Dispatch is not in `Manifest.resolve`, because `--help` has to stay the
root's help. R3's usage is shown as `[command]`, with the default's arguments and options listed
in the level's sections. All checks are in one test file. The design needs no Quint model, and the
spec gives the termination argument.

**Rejected:** dropping the intent (the native API would keep a gap both incumbents close); a root
`run` handler (it cannot carry its own options and examples apart from the globals, which is
yargs #1331 again); yargs' `$0` / `*` as names (a magic string in a name field); resolving the
default inside `Manifest.resolve` (it would make `tool --help` the default's help and change
`resolveCommand`'s public answer); a bare word always going to the default (a typo of a command
name would run the default with the typo as its argument).

**Reversal.** Remove the key. It is additive, and no program set it before this.
