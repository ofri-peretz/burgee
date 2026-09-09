# Design — Agent headroom

Intent: [`intent.md`](./intent.md). **Status:** draft — awaiting the Design→Build gate.

> Written 2026-09-09 against measured output, not against a guess: every figure below came
> from running the two reference demos. The order is chosen so the largest saving lands
> first and each step is separately measurable, because a bundle of four changes with one
> number at the end cannot say which of them paid.

---

## Requirements

- **R1 — Machine formats are compact by default.** `--schema` and `--json` emit no
  indentation and no insignificant whitespace. `--format=json-pretty` is the escape hatch for
  a human debugging.
- **R2 — Projection at the source.** `--fields a,b.c` restricts the emitted document to the
  named paths, evaluated before serialisation so the bytes never exist. Omitting the argument
  lists the valid paths; an invalid path prints the valid set (N14).
- **R3 — A byte budget, with legible truncation.** `--max-bytes N` on any machine format. A
  response that hits the ceiling stays *parseable* and says so: `{ truncated: true, ... }`
  with a continuation token, never a document cut mid-string.
- **R4 — Progressive summarisation for `--schema`** (N13): above the budget, commands
  collapse to names and one-line descriptions, and `--schema --at <path>` drills into one
  branch at full detail.
- **R5 — Streaming for a result set.** `--format=ndjson` emits one object per line, so an
  agent can stop reading at the first row that answers its question.
- **R6 — No hint is ever removed to save a byte** (intent constraint 1). The compaction rules
  operate on serialisation and projection, never on error content.
- **R7 — Every step is measured before the next begins.** `benchmarks/axes/reliability.ts`
  gains a `schema-bytes` metric alongside `recovery-bytes`, both published, both banded.

## Design

### What is actually costing bytes, measured

Three things, and only the first is large:

| Cost | Where | Size today | Fix | R |
| :-- | :-- | --: | :-- | :-- |
| Indentation | `--schema` | 42% of the document | serialise compact | R1 |
| Fields nobody asked for | `--json`, `--schema` | varies with the caller | project | R2 |
| The whole document when one branch was wanted | `--schema` | up to 39,512 B | budget + drill | R3, R4 |

`--json` on a *result* is already compact — 89 B for `greet ada --json`, 52 B for
`config get greeting --json` — so this is one surface formatted for the wrong reader, not a
habit. That matters for the order below: R1 is nearly all of the win and nearly none of the
work.

### R1 first, alone

`JSON.stringify(value)` instead of `JSON.stringify(value, null, 2)` on the schema writer.
Measured: **2,509 → 1,482 B** on the small demo, **39,512 → 22,964 B** on the large one, and
the parsed documents are `toEqual`. That is the whole change, and it is worth landing by
itself so the number on the benchmarks page has one cause.

`--format=json-pretty` keeps the human path, because the person debugging a schema is real
even though the schema's reader is not.

### R2 — projection, and why at the source

`--fields` could be done by an agent piping through `jq`. It is done here for one reason
that a pipe cannot reproduce: **the bytes never leave the process**, so a 39 KB schema that
an agent wanted three command names out of costs three command names. A pipe pays the full
serialisation first and then discards it — which is exactly what `rtk` does from outside, and
exactly the overhead a native implementation removes.

Paths are dotted, arrays project element-wise. `--fields` with no argument lists the valid
paths, and an invalid path prints the valid set (N14). That is schema discovery with no new
surface, and it is the behaviour `gh` alone of ten CLIs has.

### R3 — a budget that stays parseable

The failure this prevents: an agent receives 48,000 characters of a 60,000-character
document, `JSON.parse` throws, and it cannot tell a truncated response from a broken CLI.

So truncation is a property *of the envelope*, not of the byte stream:

```jsonc
{ "ok": true, "data": [ /* … */ ], "truncated": { "of": 412, "returned": 50, "next": "…" } }
```

The document always parses. `truncated` is absent when it is not. An agent reads one key to
know whether to ask again — which is a turn it spends deliberately, instead of a turn it
wastes on a parse error.

### R4 — progressive summarisation, and its risk

N13's shape: above the budget, commands collapse to `{ name, description }`, and
`--schema --at greet` returns that branch whole. The risk worth naming is that a summarised
schema is a *different document* from the full one, and an agent that cached the summary may
believe it has the whole thing. So a summarised schema carries `summarised: true` and the
path to drill, by the same rule as R3: the document says what it is.

### R5 — NDJSON, only where there is a stream

A result set with 400 rows is the case; a single result is not. This lands last and only if a
command with a large result set exists to justify it — the demos have none today, and a
format with no caller is a format that rots.

### Order to do it in

1. **R1** — compact `--schema`, with `json-pretty` as the escape hatch. Largest saving,
   smallest change, one cause for the number.
2. **R7** — `schema-bytes` in the reliability axis, so (1) is on the benchmarks page with its
   before figure beside it.
3. **R2** — `--fields`, then N14's listing behaviour on top of it.
4. **R3** — the budget and the truncation envelope.
5. **R4** — progressive summarisation, which needs (3)'s budget to mean anything.
6. **R5** — NDJSON, when a command exists that streams.

Steps 1 and 2 together are the smallest thing that produces a published number, which is
where this should stop if it stops.

## Verification

The loop: `npm test && npx tsx benchmarks/run.ts --axis reliability`.

| Check | Where | What it catches |
| :-- | :-- | :-- |
| R1 loses nothing | `packages/burgee/src/schema.test.ts` | compact and pretty parse to `toEqual` documents; a field dropped by compaction fails |
| R1's saving is real | `benchmarks` `schema-bytes` | the number, published beside the pretty one, banded so it cannot creep back |
| R2 projects before serialising | `packages/burgee/src/*.test.ts` | a projected document smaller than the full one *and* a spy proving the dropped branch was never stringified |
| R3 always parses | a fuzz-ish case over budgets from 10 B upward | every truncated response is valid JSON and carries `truncated` |
| R4 says what it is | the same | a summarised schema without `summarised: true` fails |
| R6 — no hint removed | `benchmarks/axes/reliability.ts` | `recovery-bytes` falls while every error still carries its `hint`; the case asserts the hint, not the size |

**The check that would have caught the thing this intent is about**: none exists today. The
`--schema` writer has been pretty-printing since it was written, every test parses the
output, and no test has ever looked at its size. `schema-bytes` is that check, and it is
step 2 for exactly that reason.

## Rejected alternatives

- **A proxy, like `rtk`.** It works, and it is evidence of the problem rather than a solution
  to it: the bytes are still produced, serialised and read off a pipe before being discarded.
  A CLI that needs no proxy is the better product, and this family's whole argument is that
  the layer should do it.
- **Compacting everything, including human output.** Intent constraint 4. A human reader is
  a caller too, and `--format` exists so neither has to lose.
- **Dropping `meta.provenance` from the default envelope.** It is the entire subject of the
  `diagnose-provenance` benchmark task. `--fields` lets a caller who does not want it drop
  it, which is the same saving without breaking the task that needs it.
- **Winning `recovery-bytes` by shortening errors.** It would work and it is the wrong trade:
  the hint is why an agent recovers in one turn instead of three, and the axis measures bytes
  because turns are not yet measurable — not because bytes are the goal. R6 exists to stop
  this being done accidentally in six months.
- **`--format=agent` (N15) first.** A second format to keep correct, before the free 42% has
  been taken. It is an open question in the intent and stays one until compact JSON is
  measured.

## Out of scope

- **The exit-code lock.** `exit-code.ts` says "no other literal may reach `process.exitCode`"
  and nothing enforces it; that is a real gap, it is one lock, and it belongs to
  `agent-native-cli-layer`'s E1 rather than here.
- A documented exit code for network failure. The family opens no sockets — verified, nothing
  in `packages/*/src` reaches `fetch`, `node:http`, `node:https` or `undici` — so this is
  guidance for a CLI *built* on us, and it belongs with the E-floor.
- Compression of the wire itself (gzip, msgpack). An agent reads text; a binary format it
  cannot inspect trades one scarcity for another.
- flagstaff and caique. Their machine surface is `static(state)`, which is already the
  smallest form of what it shows.
