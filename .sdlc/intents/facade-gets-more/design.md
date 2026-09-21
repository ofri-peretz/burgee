# Design — the façade user gets the agent surfaces too

Intent: [`intent.md`](./intent.md). **Status:** review.

---

## Requirements

| id | requirement |
| :-- | :-- |
| `G1` | A runnable command that declared no effects is a tool. Its annotations carry `effects: "undeclared"` and **none** of `readOnlyHint`, `idempotentHint`, `destructiveHint`, so MCP's own defaults — not read-only, destructive, not idempotent — are what a client falls back to. |
| `G2` | `effects: 'withheld'` still means absent from `tools/list` and refused by `tools/call`. |
| `G3` | `tools/call` on the commander façade replies, and keeps replying after an invoke has injected its own streams. |
| `G4` | On the commander façade a `--json` that no command in the program declares is burgee's envelope flag at any position before `--`: it is consumed where it stands, takes no value, does not make the rest of argv unknown, and is never reported as an unknown option. |
| `G5` | A commander-façade failure raised while that flag is set is reported as `{"ok":false,"error":{…}}` on **stdout** and nothing on stderr, carrying `fix` when exactly one suggestion was offered. |
| `G6` | commander stays 1360 / 1360 and yargs stays 804 / 804. |

## Design

### `mcp.ts` — G1, G2

`toolsOf`'s filter drops its `c.effects !== undefined` half and keeps `!== WITHHELD`.
`annotationsOf` gains one branch: `undefined` returns `{ effects: 'undeclared' }` and
nothing else.

Omitting the three hints is the whole point and is not a saving. MCP defines defaults for
each of them — `readOnlyHint: false`, `destructiveHint: true`, `idempotentHint: false` —
so an absent hint already reads as *assume the worst*, in the client's own vocabulary,
without burgee inventing a value it has no basis for. `effects: "undeclared"` on top of
that is the positive statement: this is different from a command whose author said
`read_only`, and different again from one who said `withheld` and is not here at all.

`callTool` stops building a `Set` of exposed names and finds the node with the same
predicate `toolsOf` filters by. That is the same answer in fewer bytes, which is what
pays for the branch above — the net effect on entry `.` is **−26 B**, so the root entry
gets lighter rather than heavier.

### `commander/command.ts` — G3

`_burgeeSurfaceRest` served `--mcp` with `output: { write: (s) => root._outputConfiguration.writeOut(s) }`.
That reads `writeOut` **at call time**, and the first `tools/call` replaces
`_outputConfiguration` on every command in the tree — `_prepareBurgee` does that, by
design, so the invoke can capture the run's output. From then on every JSON-RPC reply was
written into the invoke's discarded capture array, so the client got silence and the
process exited 0 with the call half-done.

The fix is one line: read `writeOut` once, before serving, and close over the function.
The default `writeOut` is an arrow that does not use `this`, so capturing it is safe.

This is the one defect in the set that a user cannot work around, and it fired on a
program that had done everything right — it had declared its effects.

### `commander/command.ts` — G4

`_takeJson` ran from `_parseCommand`, guarded on `this._actionHandler`, and spliced
`--json` out of the *unknown* list after `parseOptions` had already treated it as an
unknown option. Two consequences, both measured: a command group's root never reached the
guard at all, and by the time the splice ran commander had already moved `dest` to
`unknown` and swallowed the following operand as the flag's value.

So the flag is recognised where every other flag is recognised — inside `parseOptions`,
immediately after `_findOption` fails. `_takeJson` and its call site are deleted; nothing
else in the pipeline changes.

Ownership is decided over the whole tree, not the ancestor chain: `_declares(flag)` walks
from the root and answers true if **any** command declares it, so a program that declares
`--json` on a subcommand keeps it and the root does not consume it on that subcommand's
behalf. The graded suite's only `--json` is a declared
`new commander.Option('-j, --json', …)` in `options.conflicts.test.js`, which this answers
true for, so the suite never enters the new branch.

`_declares` is one method rather than a second helper: `_burgeeSurface` had a closure doing
the same walk for `--schema` and `--mcp`, and it now calls this. Deleting that closure and
`_takeJson` part-pays for the new code — see the byte note below.

### `commander/command.ts` — G5

`error()` gains one branch at the top. With the envelope flag set it writes
`{"ok":false,"error":{code,message,fix?}}` to stdout and skips the prose and
`showHelpAfterError`; otherwise it is byte-for-byte what it was. The exit code and the
`CommanderError` are unchanged, so `exitOverride` and every graded expectation still see
what they saw.

`message` is normalised for the envelope only: the `error:` prefix is dropped and the
suggestion line is lifted out into `fix`, which is E3's contract — the exact flag or
command a caller can run, against the prose a person reads. `fix` is set only when the
suggestion names exactly one candidate; `(Did you mean one of --a, --b?)` names two and
is not a fix.

A `reported` flag on `_burgee` stops `_runBurgee`'s `fail` writing a second envelope for
the same error when the harness is driving and the `CommanderError` propagates.

### Byte budgets

`./commander` is the only ceiling that moves: 128,973 → **129,323** measured, budget
129,000 → 129,400, recorded in `weight.test.ts` at the point of change and in D-077.
Everything else moves **down** by 27 B, `.` included: 60,661 → **60,634**, 39 B under its
ceiling before this change and 66 B under it after.

And one number to distrust while reading those: `scripts/strip-comments.mjs` iterates
`readdirSync(dir)` and does not recurse, so `dist/commander/` is never stripped and
**14,312 B of the `./commander` entry is doc comments** — 41× the change above. Measured by
transpiling the five files with `removeComments`. Not fixed here: it is `scripts/`, which
this lane does not own, and it would move several entries at once.

## Verification

`packages/burgee/src/facade-surface.test.ts` — one file, the probes from the intent's
table run against a real façade program in-process, plus the yargs façade for G1/G2.

```
npx vitest run packages/burgee/src/facade-surface.test.ts packages/burgee/src/mcp.test.ts packages/burgee/src/weight.test.ts
npm run compat -- commander     # 1360 / 1360
npm run compat -- yargs         # 804 / 804
```

Each test names the mutation it was proved red against, in the file, beside the
assertion. Every one was run against the unfixed tree first.

## Rejected alternatives

**Give a façade command a default of `non_idempotent` instead of `undeclared`.** It reads
as a declaration and it is not one. An agent that treats a guessed `non_idempotent` as the
author's word will decline to run a `git status` wrapper forever, and an author who later
declares `read_only` cannot tell whether the change did anything. Absence of a hint
already carries MCP's conservative default; adding a word that is a guess is worse than
adding nothing.

**Make the façade refuse to serve `--mcp` until every command declares.** It is the
strictest reading of N6 and it is the one that keeps the pitch false. Absent-from-the-list
is strictly worse for the caller than present-with-honest-annotations: an agent that
cannot see a command cannot decide about it, and cannot even ask.

**Make `checkCommand` refuse an undeclared façade command, as it does a native one.**
Neither incumbent has a notion of effects, so every command in both graded suites would
throw on construction and both rows would go to zero. This is the constraint that made the
original filter conservative and it has not changed.

**Emit E1 numeric codes in the façade's failure envelope, matching the engine.** The
façade's envelope already ships with commander's string codes (`commander.unknownOption`),
and those are the codes its `exitOverride` callers already branch on. Changing the code
*space* in the same change that makes the envelope reachable would mean two things moved
at once and no way to attribute a break. `fix` is added because it is new information;
`code` is left alone.

**Handle `--json` in `_parseCommand` but unguarded, rather than in `parseOptions`.** It
fixes the command-group root and leaves the swallowed-operand defect, because the operand
is consumed before `_parseCommand` sees the list. Half of a two-line fix is not cheaper.

## Out of scope

- `--help --json` (F2) and `--explain` (V3) on the façades. Both are served by the engine's
  `dispatch`, which the façades never enter — they answer `--help` themselves, which is
  what makes them byte-identical to their incumbents. Reaching F2 means the façade
  rendering a help document instead of commander's help, and that is a change to the
  graded surface, not an addition beside it. Measured and tabled in the PR instead.
- `--schema` publishing `effects: "undeclared"` for a façade node. The manifest is honest
  today (the field is absent) and `--schema` passes it through. Saying the word there too
  is right, and it costs bytes on `.` in a change whose point was not to.
- The exit code a façade failure returns under `--json` stays commander's.
