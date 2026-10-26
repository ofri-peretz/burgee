# Design — Agent headroom

Intent: [`intent.md`](./intent.md). **Status:** approved (2026-10-25).

**Accepted by the owner (Ofri) on 2026-09-09, at the Design→Build gate**, scoped to **R1 plus
R7's metric** — the compact serialisation and the `schema-bytes` measurement that publishes it.
Everything from R2 down stays at the gate and needs its own acceptance; the ordering in
"Sequence" below is unchanged, and R1 was chosen first for the reason stated there: it is
nearly all of the win and nearly none of the work.

One thing this design predates, recorded here rather than silently absorbed: the owner's
"we should support **any** format that will provide value". `formats` as an open key on the
plugin object is written up under "Registered formats" below, but it is not yet a numbered
requirement, and it should become one before R5 or `--format=tsv` is built.

> Written 2026-09-09 against measured output, not against a guess: every figure below came
> from running the two reference demos. The order is chosen so the largest saving lands
> first and each step is separately measurable, because a bundle of four changes with one
> number at the end cannot say which of them paid.

**Restated:** 2026-10-18 — see [§ Restated 2026-10-18](#restated-2026-10-18)

---

## Design gate 2026-10-25

**Accepted for Build, narrowed**
([D-20261025-agent-headroom-design-accepted](../../decisions/D-20261025-agent-headroom-design-accepted.md)).
Re-grounded on `main` at `c92e4173f4`. R1 holds, R2/R4/N15 shipped as `burgee` N14/N13/N15, and
R7 holds as restated. The build is four pieces, in this order.

**In scope.**

1. R6, the hint-survival lock. A failing command run with `--json=<a>` and with
   `--format=agent` still carries the same `hint` and `fix` it carries with plain `--json`.
   It needs no code, only the lock. Proven red by stripping `hint` from the agent renderer in a
   scratch edit.
2. RF, registered formats. `formats` becomes a key on the family plugin object that burgee
   hosts: `{ [name]: { render(value) => string, description } }`, validated by the family
   schema. `--format=<name>` picks one, and `--format` with no value lists every registered
   name, built-ins included. `tsv` ships as the first one through that same path, not as a
   special case. A list result renders a header row and one line per row. A non-list result
   refuses with a `hint` naming `--json`. A failure is never rendered by a registered format:
   the envelope rule holds, and R6's lock covers registered formats too.
3. R3, the row budget. `--max-bytes N` on any machine format. A list result over budget is cut
   at a whole row and stays parseable. The envelope carries `truncated: { of, returned }`, and
   the key is absent when nothing was cut. A non-list result over budget is not cut: it is
   returned whole with `truncated: { of: 1, returned: 1, over: <bytes> }`, so the caller learns
   the budget was exceeded without receiving a broken document. No continuation token.
4. C1, the large-demo figure. A test over `examples/demo-cli-large`'s `--schema` asserts that
   compact is at least 40% smaller than pretty and that the two parse equal. The reliability
   axis records `schema-bytes-pretty` beside `schema-bytes`, reported and not banded.

**Acceptance checks.**

- The lock files: `packages/burgee/src/hint-survives.test.ts` (R6),
  `packages/burgee/src/formats.test.ts` (RF), `packages/burgee/src/max-bytes.test.ts` (R3) and the
  large-demo case in `machine-json.test.ts` (C1).
- Each check is run against the unfixed tree first and seen red.
- R3 is fuzzed over budgets from 10 B up to the full size, and every output parses.
- `packages/burgee/src/weight.test.ts` stays green. If RF or R3 move the root entry, the PR
  re-converges the budget and states the delta in bytes.

**What to measure.** `tsv` bytes against minified JSON on the fifty-row fixture (the design
measured 63%), recorded in the PR. The root entry's bundled bytes before and after. The pretty
and compact `--schema` bytes of the large demo.

**Dropped at this gate.** R5 (`--format=ndjson`): no command streams, and once RF lands an author
registers it as one format. R2's dotted result paths: no caller asked for them. The token claim
stays unmade until a token count is measured.

## Build 2026-10-25

**The four pieces the gate accepted are built on the branch `feat/agent-headroom`, and each check
was seen red first.** Code-bearing pieces ship with the next `burgee` minor (release window not
before 2026-11-01), so the intent stays `approved` until that release is published and the
criteria are re-read on it. No state machine was added, so there is no Quint model for this
build: each piece is a pure function of argv and a result.

| Piece | Check | Red first |
| :-- | :-- | :-- |
| R6, hint-survival lock | `packages/burgee/src/hint-survives.test.ts` | stripping `hint` from a failure when `--format=agent` or `--json=` is typed failed 12 of its cases; the `tsv`, plugin-format and `--max-bytes` cases failed on `main` because those surfaces did not exist |
| RF, `formats` + `tsv` | `packages/burgee/src/formats.test.ts`; `scripts/plugin-schema-agreement.test.ts` › "burgee formats"; `packages/burgee/src/check.test.ts` | failed on `main`: no `formats.ts`, `--format=tsv` refused as an unknown option |
| R3, row budget | `packages/burgee/src/max-bytes.test.ts` | failed on `main`: no `max-bytes.ts`, `--max-bytes` refused as an unknown option |
| C1, large demo | `packages/burgee/src/machine-json.test.ts` › "the large demo’s --schema (C1)"; `benchmarks/reliability.test.ts` › "schema-bytes-pretty" | indenting compact output by one space dropped the saving to 17.1% and failed the 40% bound |

What was built, where the design left a choice:

- **R6 is an identity, not a presence check.** A failing command run with `--json=<a>`,
  `--format=agent|tsv|<plugin's>` or `--max-bytes` writes exactly what it writes without them:
  the same envelope byte for byte under `--json`, the same prose on stderr without it. A plugin
  format that renders nothing is registered in the lock, so a failure that ever reached a format
  would lose its hint there.
- **RF.** `formats` is a key on the family plugin object, described in the family schema
  (`$defs.format`) and synced to every host. burgee checks it where `--format` first uses it and
  in `burgee check`, not at `use()`, the choice `locales` made, so the root entry carries no
  validator for it. burgee's own `agent` and `tsv` are registered by a plugin object of its own
  through that same check. `text`, `json` and `json-pretty` are taken names: `--format=json` and
  `--format text` keep their D-20261009 spellings. An unregistered name is refused with the names
  there are. `--schema`'s `output.formats` names the same set as `--format`, and a test holds the
  two equal. A non-list result under `tsv` is refused with a hint naming `--json`, after the
  handler ran, because only the result says whether it is a list.
- **R3.** `--max-bytes <n>` is read with the R1–R3 globals: either spelling, before the command
  or after it, and a command's own `maxBytes` option wins. A list result is cut at the last whole
  row that fits, found by binary search. The `--json` envelope carries `truncated: { of, returned }`,
  absent when nothing was cut. A non-list result is returned whole with `{ of: 1, returned: 1,
  over }`. `over` is also set on a list that does not fit even empty, and it is the exact number
  of bytes the sent document is over. The line formats have no envelope, so stdout keeps whole
  rows and the same `{"truncated":…}` object goes to stderr as one JSON line. `--max-bytes`
  without `--json`, a `--json` spelling or a registered format is refused before the handler
  runs. It is not a row in help's `Global options:`, because that table is `--schema`'s
  `global_args` and `schema-bytes` is gated. That row waits for a decision of its own
  ([D-20261026-schema-bytes-registered-formats](../../decisions/D-20261026-schema-bytes-registered-formats.md)).
- **`schema-bytes` budget.** `output.formats` naming `tsv` took the demo's `--schema` from
  4,650 B, exactly its budget, to 4,656 B. The budget rises to 4,700 by the rule it was set by
  ([D-20261026-schema-bytes-registered-formats](../../decisions/D-20261026-schema-bytes-registered-formats.md)).
  The other choice was a schema that undercounts the formats the CLI takes.
- **C1.** The large demo is loaded from its source by a computed specifier, because it is outside
  the package's `rootDir`. The reliability axis records `schema-bytes-pretty` beside
  `schema-bytes`, reported and not banded.

Measured on this branch, 2026-10-25:

| What | Before | After |
| :-- | --: | --: |
| `tsv` against minified JSON, fifty rows of four fields (`formats.test.ts` fixture) | 3,170 B | 1,293 B (59.2% smaller; the design measured 63% on its own fixture) |
| large demo `--schema`, pretty against compact | 42,783 B | 25,197 B (41.1% smaller) |
| burgee demo `--schema`, `schema-bytes-pretty` against `schema-bytes` (reliability axis, local) | 7,717 B | 4,656 B (39.7% smaller; gate 4,700) |
| root entry `.`, static graph on disk (`weight.test.ts`, budget 36,100) | 36,073 B | 35,988 B (−85) |

The root entry got smaller: the `--json=` listing and its field check moved into the lazily
loaded `fields.js`, which saved more than the new `print` hook costs. Bundled, `import { run }
from 'burgee'` went from 24,486 to 24,442 B, and `burgee/commander` stays at 1.415× commander.
No weight ceiling was raised. The family schema grew by 930 B in every host's tarball, and
`npm run weight:converge` re-recorded six foundation layers (for example, bellpull 96,671 →
97,601 B, ratio 0.1263 → 0.1275). seniority's own dist ceiling had too little room, so it rises
from 144,000 to 144,700 (144,607 B measured)
([D-20261026-seniority-family-schema-formats](../../decisions/D-20261026-seniority-family-schema-formats.md)).

**Remaining:** publication. Once the `burgee` minor carrying this is on npm, re-read R3, R6, RF
and C1 against the published package, and then the intent can be stamped `shipped`. The
first published `schema-bytes-pretty` figure comes from the next recorded benchmark run.

## Restated 2026-10-18

**R1 holds, R2 and R4 shipped as `burgee` N14 and N13, R6 and R7 are restated; R3, R5 and RF were never built — REMAINING: R2 (dotted result paths), R3, R5, R6 (hint-survival lock), RF.**

The full table, with the check for each row and the success criteria C1–C5, is in the intent's
[§ Restated 2026-10-18](./intent.md#restated-2026-10-18). Per requirement:

- **R1** held: `packages/burgee/src/machine-json.test.ts`.
- **R2** moved → `burgee` N14, as `--json=<a,b>` (D-114), held by
  `packages/burgee/src/json-fields.test.ts`. Top-level fields only. Dotted paths into a result
  are remaining.
- **R3** remaining. D-062 placed the budget on every machine format, and `--max-bytes` does
  not exist.
- **R4** moved → `burgee` N13, held by `packages/burgee/src/agent.test.ts` and
  `packages/burgee/src/schema-field.test.ts`. The drill is `--schema <command> --field <path>`
  (D-116), not `--at`.
- **R5** remaining. `clispec-conformance` records `--format=ndjson` as unbuilt and does not
  take it.
- **R6** restated. Compaction is shown value-preserving and `--format=agent` never renders a
  failure. The hint-survival check in [Verification](#verification) was never built, so that
  lock is remaining.
- **R7** restated. `schema-bytes` is published and banded as `agent-schema-bytes`.
  `recovery-bytes` is published and deliberately unbanded ("reported, never gated").
- **RF** (the "Registered formats" step below, numbered here as the preamble asked) is
  remaining. No `formats` key exists on the plugin object, and there is no `--format=tsv`.

## Requirements

- **R1 — Machine formats are compact by default.** `--schema` and `--json` emit no
  indentation and no insignificant whitespace. `--format=json-pretty` is the escape hatch for
  a human debugging. **2026-10-18: held** (D-061) by `packages/burgee/src/machine-json.test.ts`.
- **R2 — Projection at the source.** `--fields a,b.c` restricts the emitted document to the
  named paths, evaluated before serialisation so the bytes never exist. Omitting the argument
  lists the valid paths; an invalid path prints the valid set (N14). **Restated 2026-10-18:**
  shipped as `--json=<a,b>` over top-level result fields (D-114), moved to `burgee` N14 and
  held by `json-fields.test.ts`; dotted result paths remaining.
- **R3 — A byte budget, with legible truncation.** `--max-bytes N` on any machine format. A
  response that hits the ceiling stays *parseable* and says so: `{ truncated: true, ... }`
  with a continuation token, never a document cut mid-string. **2026-10-18: remaining.**
- **R4 — Progressive summarisation for `--schema`** (N13): above the budget, commands
  collapse to names and one-line descriptions, and `--schema --at <path>` drills into one
  branch at full detail. **Restated 2026-10-18:** moved to `burgee` N13, drilling as
  `--schema <command> --field <path>` (D-116); held by `agent.test.ts` and
  `schema-field.test.ts`.
- **R5 — Streaming for a result set.** `--format=ndjson` emits one object per line, so an
  agent can stop reading at the first row that answers its question. **2026-10-18: remaining.**
- **R6 — No hint is ever removed to save a byte** (intent constraint 1). The compaction rules
  operate on serialisation and projection, never on error content. **Restated 2026-10-18:**
  each compaction is shown not to touch failures; a lock that a failure's `hint` survives
  `--json=<fields>` and `--format=agent` is remaining.
- **R7 — Every step is measured before the next begins.** `benchmarks/axes/reliability.ts`
  gains a `schema-bytes` metric alongside `recovery-bytes`, both published, both banded.
  **Restated 2026-10-18:** both published; `schema-bytes` banded (`agent-schema-bytes`),
  `recovery-bytes` reported and deliberately unbanded — held by `benchmarks/bands.test.ts`.

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

### Formats: what is actually smaller, measured

The question "is there something more compact than JSON" has a measurable answer, and it is
not subtle. Fifty rows of four fields, the shape a `list` command returns:

| Format | Bytes | Smaller | Why |
| :-- | --: | --: | :-- |
| JSON, minified | 2,749 | — | 200 key occurrences |
| NDJSON | 2,747 | 0% | same keys; the win is *streaming*, not size |
| logfmt (`k=v` per line) | 2,047 | 26% | drops braces, quotes, commas; keeps keys |
| Markdown table | 1,554 | 43% | keys once; padding and pipes cost |
| **TSV with a header** | **1,018** | **63%** | keys once, one delimiter, nothing else |

The whole effect is **key repetition**. JSON writes `K` keys `N` times; a header writes them
once. That is why the saving grows with row count and is nil for a single object — and why
`--format=tsv` belongs on a *result set* and nowhere else.

NDJSON earning 0% is the useful result here: it is worth having for a different reason, which
is that an agent can stop reading at the row that answers its question, and R5 stays where
it is on that basis rather than on size.

### Bytes are not tokens, and we measure bytes

**This is the limitation of our own metric and it is stated rather than buried.** A BPE
tokenizer encodes a repeated JSON key efficiently — the second `"status":` costs far less
than the first — so a 63% *byte* saving is not a 63% *token* saving, and nobody should quote
it as one. The direction is right and the magnitude is unknown.

`recovery-bytes` and `schema-bytes` are byte counts because bytes are what we can measure
without depending on a particular tokenizer, and a metric that varies by model is a metric
that cannot ratchet. **No token-percentage claim ships until a token count is measured**, and
until then the benchmarks page says "bytes" everywhere it means bytes.

### Who chooses the format — the author, not this design

The formats above are a starting set, not a closed enum, and the mechanism already exists:
[`plugin-contract`](../plugin-contract/intent.md). A format is data plus one function —
`(value) => string` — which is exactly the shape a flagstaff component's `static(state)` has
and exactly what the contract admits.

So `formats` becomes a key on the shared plugin object, hosted by burgee:

```js
export default {
  name: 'acme',
  formats: {
    // A caller then runs `mytool list --format=acme-rows`.
    'acme-rows': { render: (value) => /* … */, description: 'one line per row, acme style' },
  },
};
```

Three consequences worth stating:

- **A CLI author decides what their agents read.** Someone whose output is deeply nested gets
  no help from TSV and may want their own shape; someone with a wide table wants TSV as the
  default. Neither is a decision this design can make for them.
- **`--format` lists what is registered**, so an agent discovers the choice the same way it
  discovers everything else — no second mechanism, and N14's listing behaviour covers it.
- **A format cannot break the envelope contract.** `ok`, `error`, `hint` and `truncated` mean
  the same thing in every format or they mean nothing; a registered format renders the
  envelope, it does not get to redefine it. That is the same rule U3 puts on a component,
  and the reason a format is a projection rather than a plugin that writes to a stream.

R6 applies here with force: a format that drops the `hint` to win bytes is refused at
registration, not left to a reviewer.

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
7. **Registered formats** (`formats` on the plugin object), and `--format=tsv` as the first
   one shipped that way rather than as a built-in — which proves the extension point with
   the format that has the largest measured saving.

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

- **The exit-code lock.** ~~`exit-code.ts` says "no other literal may reach
  `process.exitCode`" and nothing enforces it~~ — **done**, as
  `scripts/exit-code-lock.test.ts`. It went to `burgee`'s E1 rather than
  here, and found one offender on its first run: `flagstaff/src/cli.ts` wrote `1` straight
  to the process.
- A documented exit code for network failure. The family opens no sockets — verified, nothing
  in `packages/*/src` reaches `fetch`, `node:http`, `node:https` or `undici` — so this is
  guidance for a CLI *built* on us, and it belongs with the E-floor.
- Compression of the wire itself (gzip, msgpack). An agent reads text; a binary format it
  cannot inspect trades one scarcity for another.
- flagstaff and caique. Their machine surface is `static(state)`, which is already the
  smallest form of what it shows.
