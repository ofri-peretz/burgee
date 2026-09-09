# Intent — Agent headroom: every machine-readable byte earns its place

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md),
> findings **N13**, **N14** and **N15**; and of [`cli-benchmarks`](../cli-benchmarks/intent.md)
> B1, which is where the claim is measured. Gathers three findings that are currently routed
> to three different intents — one of them deferred — under the one decision they share.

**Status:** draft · **Opened:** 2026-09-09 · **Owner:** @ofri-peretz

---

## What is wanted

An agent's context window is the scarcest thing in the loop it runs. A CLI that spends it on
whitespace, on repeated keys, on fields nobody asked for, and on a schema it re-reads every
session is a CLI that costs turns it never had to.

**Every byte a machine-readable surface emits should be one a caller asked for.** Concretely:
compact by default for machine formats, projection at the source, a declared budget with
*legible* truncation, and a streaming form an agent can stop reading early.

## The finding that opened it

`--schema` is the one command an agent runs first — N8 makes it work with no auth, no config
and no network precisely so it can be. It is pretty-printed.

| | pretty | minified | saved |
| :-- | --: | --: | --: |
| `demo-cli-burgee --schema` | 2,509 B | 1,482 B | **41%** |
| `demo-cli-large --schema` | 39,512 B | 22,964 B | **42%** |

Measured 2026-09-09. **No information is lost** — it is the same document. On the large demo
that is roughly ten thousand tokens spent on indentation, in the first thing an agent reads.

`--json` on a result is already compact, so this is not a general sloppiness; it is one
surface formatted for a reader that is never human.

## Why now, and why one intent

The three findings are live and scattered, and each is small enough alone to keep being
deferred:

- **N13** — `--schema` token-budget aware, progressively summarised above a declared budget,
  with field-path drilling. Routed to `cli-mcp`.
- **N14** — omitting `--json`'s argument lists the valid fields; an invalid field prints the
  valid set. Routed to `commander-schema`.
- **N15** — an `agent` output format that is *not* JSON: one compact line per record,
  grep-able. Routed to `cli-help-renderer`, which **deferred it to wave 3** with the note
  that `--format` should be decided once.

`cli-help-renderer` is right: `--format` is one decision. Three intents each owning a third
of it is how it stays unbuilt.

There is also a competitive reason. The user of this repo runs `rtk`, a proxy that claims
60–90% token savings by rewriting CLI output on its way to an agent. That a proxy is worth
building is the evidence that the CLIs underneath are wasteful. A CLI that needs no proxy is
a better product than one that tolerates one.

## Affected users and systems

- `packages/burgee`: the `--json` and `--schema` writers, `--format`, and the manifest
  projection they both read.
- `benchmarks/axes/reliability.ts`: `recovery-bytes` already measures this, and it is the one
  column where we currently lose. A schema-bytes metric joins it.
- `apps/docs`: the benchmarks page publishes the number, before and after.
- `packages/flagstaff`, `packages/caique`: unaffected — this is about machine formats, and
  their machine format is `static(state)`, which is already minimal.

## Constraints

1. **Never compress away the reason.** Our errors carry a `hint` naming the fix, and that
   hint is why we cost more bytes than commander on a failure. Bytes are not the objective;
   *turns* are, and a hint that saves a turn pays for itself many times. Anything that
   removes a hint to win a byte count is the wrong trade and this intent refuses it.
2. **Truncation is legible or it does not happen.** A budget that silently cuts a JSON
   document produces something an agent cannot parse and cannot know is partial. A truncated
   response says it was truncated and how to get the rest.
3. **One decision, one flag.** `--format` picks the surface; `--fields` projects it. Not a
   flag per idea.
4. **A default may not surprise a human.** Compacting `--schema` is safe because its reader
   is a machine. Compacting something a person reads is a different decision and is not this.
5. **Measured, or it does not ship.** Every claim here is a number on the benchmarks page,
   with the before figure kept beside the after.

## Success criteria

- `--schema` on the large demo drops by ≥40% with no information lost, and the figure is
  published beside the pretty-printed one.
- `--fields a,b` projects at the source: the bytes never leave the process.
- A declared budget truncates legibly — the response says it is partial and how to continue —
  and a test proves an agent can tell a truncated response from a complete one.
- `recovery-bytes` for burgee moves below commander's without any `hint` being removed, or
  the intent reports that it could not and why.
- N14's field listing works: `--json` with no argument lists valid fields; an invalid one
  prints the valid set.

## Open questions

- **Is compact the default for `--schema`, or opt-in?** Proposed: default. Its reader is a
  machine by construction (N8), and `--format=json-pretty` covers the human debugging it.
- **Does the `agent` format (N15) earn its place beside compact JSON?** One compact line per
  record is smaller than JSON and grep-able, but it is a second format to keep correct.
  Proposed: decide it on a measurement, not on taste — build compact JSON first, measure, and
  only add `agent` if the delta justifies a second surface.
- **Where does the budget live?** N13 puts it on `--schema`. Proposed: on any machine format,
  because a large result set has the same problem a large schema does.
- **Does `meta.provenance` stay in the default envelope?** It is the whole point of the
  `diagnose-provenance` benchmark task and dead weight in every other. Proposed: keep it, and
  let `--fields` drop it — a default that is right for the task that needs it, projectable
  by the tasks that do not.
