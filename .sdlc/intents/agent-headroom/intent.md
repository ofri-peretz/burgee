# Intent — Agent headroom: every machine-readable byte earns its place

> Stage 1 artifact. Child of [`burgee`](../burgee/intent.md),
> findings **N13**, **N14** and **N15**; and of [`cli-benchmarks`](../cli-benchmarks/intent.md)
> B1, which is where the claim is measured. Gathers three findings that are currently routed
> to three different intents — one of them deferred — under the one decision they share.

**Status:** shipped (2026-10-26, every criterion re-read against `burgee@1.7.2` as installed from npm, [`D-20261026-shipped-on-published-patch`](../../decisions/D-20261026-shipped-on-published-patch.md)) · **Opened:** 2026-09-09 · **Owner:** @ofri-peretz

> **Accepted at the Design→Build gate 2026-10-25** by the coordinator under the owner's delegation
> ([`D-20261025-agent-headroom-design-accepted`](../../decisions/D-20261025-agent-headroom-design-accepted.md)): narrowed to R3 (row budget), R6 (hint-survival lock), RF (`formats` with `tsv`) and C1 (large-demo figure); R5 and R2's dotted paths dropped. See
> [`spec.md` § Design gate 2026-10-25](./spec.md#design-gate-2026-10-25).

**Restated:** 2026-10-18 — see [§ Restated 2026-10-18](#restated-2026-10-18)

**Built 2026-10-25, awaiting the `burgee` minor.** All four accepted pieces are built and each
check was seen red first. R6: `hint-survives.test.ts`. RF: `formats.test.ts`, with `tsv` 59.2%
under minified JSON on fifty rows. R3: `max-bytes.test.ts`, fuzzed at every budget. C1: the
large-demo case in `machine-json.test.ts` (41.1%), plus `schema-bytes-pretty` beside
`schema-bytes`. See [`spec.md` § Build 2026-10-25](./spec.md#build-2026-10-25). The status stays
`approved` until the release that carries them (not before 2026-11-01) is published and the
criteria are re-read on the published package. *2026-10-26: that release came early, as the
patch `burgee@1.7.2`, and the re-read is § Shipped 2026-10-26 below.*

---

## Shipped 2026-10-26

**All four accepted pieces, and every success criterion, hold on the published package.** Version
PR #1253 published `burgee@1.7.2` on 2026-10-26 from `main` at `c4230e33` (its `gitHead`); #1266,
which built R6, RF, R3 and C1, is an ancestor of it, and the tarball carries `dist/formats.js` and
`dist/max-bytes.js`. It went out as a patch, because the release window holds a minor's version
number and not its code
([`D-20261026-shipped-on-published-patch`](../../decisions/D-20261026-shipped-on-published-patch.md)).

Every row was run on 2026-10-26 in an empty `mktemp -d` directory after `npm i burgee@1.7.2`, over
a probe program: `packages` returns the design's fifty rows of four fields (its `fields` declared), `show` a non-list
result, `ls` a `UsageError` with a hint, and one plugin registers a `pins` format through
`definePlugin({ formats })`. None of it read the workspace.

| Criterion | Command, against `burgee@1.7.2` | Output |
| :-- | :-- | :-- |
| C1. `--schema` on the large demo ≥ 40% smaller, no information lost, the pretty figure beside it | `examples/demo-cli-large` compiled into the temp directory, importing the installed `burgee`; `--schema` and `--schema --format=json-pretty` | 25,203 B against 42,796 B, **41.1%** smaller, and the two parse deep-equal. The reliability axis records `schema-bytes-pretty` (7,717 B, "reported, never gated") beside `schema-bytes` (4,656 B) in `benchmarks/results/cli-benchmarks/2026-10-26-c4230e3-ci.json`, the CI measurement of the release commit |
| C2. `--json=<a,b>` selects at the source | `ah packages --json=name,version` (N14, shipped earlier) | `{"ok":true,"data":[{"name":"package-1","version":"1.0.0"},…` — the two fields of each row, nothing else |
| C3. A budget truncates legibly, and an agent can tell partial from complete (R3) | `ah packages --json --max-bytes 300`; `--max-bytes 100000`; `ah show --json --max-bytes 50`; `ah packages --format=tsv --max-bytes 120` | 3 whole rows, parses, `"truncated":{"of":50,"returned":3}`. Under budget: no `truncated` key. A non-list result is returned whole with `"truncated":{"of":1,"returned":1,"over":285}`. TSV: a header and 4 rows, `{"truncated":{"of":50,"returned":4}}` on stderr |
| C4. `recovery-bytes` below commander's, or a report of why not | unchanged, reported 2026-10-18 | no hint was removed (R6, next row) |
| C5. `--json=` lists the valid fields | `ah packages --json=`; `ah packages --json=nope` (N14, shipped earlier) | `"data":{"fields":["id","name","version","private"]}` without running the handler; `unknown field "nope"`, `hint: valid fields: id, name, version, private`, exit 2 |
| R6. No hint is lost to a compaction | `ah ls --json` as the reference, against `ah ls` with `--json=name`, `--format=agent --json`, `--format=tsv --json`, `--format=pins --json`, `--max-bytes 10 --json`; stderr of `ah ls` against `--format=agent`, `--format=tsv`, `--format=pins`, `--max-bytes 10 --format=agent` | all nine byte-identical to their reference. The reference carries `"hint":"unlock it with ah unlock"` |
| RF. `formats` on the plugin object; `tsv` the first registered format | `ah packages --format`; `--format=pins`; `--format=tsv`; `ah deploy … --format=tsv`; `--format=nope` | the list names `text`, `json`, `agent`, `tsv` and the plugin's `pins`. `pins` prints `package-1@1.0.0` per row. TSV is 1,293 B against minified JSON's 3,170 B on the fifty rows, **59.2%** under. A non-list result is refused with `hint: run it with --json for the whole result`, exit 2. An unknown name is refused with `hint: formats: text, json, agent, tsv` |

## Restated 2026-10-18

**Compact JSON, field selection, the schema budget and the agent format shipped (the last three as `burgee` N13–N15); the budget for results, NDJSON, registered formats and three smaller pieces did not — REMAINING: R2, R3, R5, R6, RF, C1.**

Audited read-only against `main` at `1013b65db5` (2026-10-18). No test was run; "held" means
the named check exists on `main` and asserts the criterion. IDs: R1–R7 are
[`spec.md`](./spec.md)'s requirements. RF is the "Registered formats" step the spec says must
become a numbered requirement. C1–C5 are the five [Success criteria](#success-criteria)
bullets in order. Three of the findings this intent gathered shipped under the umbrella
[`burgee`](../burgee/spec.md) instead. Its status table marks N13, N14 and N15 **Built**,
and this intent now points there rather than restating them.

| ID | promised | on main | check | disposition |
| :-- | :-- | :-- | :-- | :-- |
| R1 | `--schema` and `--json` compact by default; `--format=json-pretty` indents | yes (D-061) | `packages/burgee/src/machine-json.test.ts` › "emits no insignificant whitespace by default", › "indents when a person asks", › "writes no newline but the trailing one, and no indentation" | held |
| R2 | `--fields a,b.c` projects before serialising; no argument lists paths; an invalid path prints the valid set | as `--json=<a,b>`: top-level fields of the result, element-wise over a list (D-114) | `packages/burgee/src/json-fields.test.ts` › "selects the named fields of an object result", › "selects from each row of a list result, checked against the rows it returned" | moved → burgee N14 (held); dotted result paths remaining |
| R3 | `--max-bytes N` on any machine format; a truncated response parses and says so | no; `--max-bytes` does not exist | none | remaining |
| R4 | `--schema` summarised above a budget; `--schema --at <path>` drills | yes, drilling as `--schema <command> --field <path>` (D-116) | `packages/burgee/src/agent.test.ts` › "summarises above the budget, names every command, and says how to drill"; `packages/burgee/src/schema-field.test.ts` › "returns the one field, not the command around it", › "refuses a step that does not exist, naming the steps that do" | moved → burgee N13 (held) |
| R5 | `--format=ndjson` for a result set | no | none | remaining |
| R6 | no hint removed to save a byte; compaction never touches error content | partly: each compaction is shown not to touch failures, but no check asserts a hint survives | `packages/burgee/src/machine-json.test.ts` › "the two parse to the same value — which is why bytes, not shape, is the assertion"; `packages/burgee/src/agent-format.test.ts` › "a failure without --json is still prose on stderr, stdout empty" | restated; hint-survival lock remaining |
| R7 | `schema-bytes` beside `recovery-bytes` in the reliability axis, both published, both banded | `schema-bytes` published and banded; `recovery-bytes` published, deliberately unbanded | `benchmarks/bands.test.ts` › "agrees with .sdlc/bands/control-bands.json, band for band", › "goes red for a band nothing produces" | restated |
| RF | `formats` as an open key on the plugin object; `--format=tsv` as the first registered format | no | none | remaining |
| C1 | `--schema` on the large demo drops at least 40%, no information lost, published beside the pretty figure | value-identical and more than 30% smaller on the test fixture; compact figure published | `packages/burgee/src/machine-json.test.ts` › "is smaller by the margin the design measured", › "is smaller than the pretty form, and the two parse alike" | restated to 30% (held); large-demo 40% and the pretty figure remaining |
| C2 | `--fields a,b` projects at the source | as `--json=<a,b>` | as R2 | moved → burgee N14 (held) |
| C3 | a declared budget truncates legibly, and a test proves an agent can tell partial from complete | for `--schema` only: `summarised: true` plus the way to drill | `packages/burgee/src/agent.test.ts` › "summarises above the budget, names every command, and says how to drill"; `packages/burgee/src/schema.test.ts` › "over its budget, the summary keeps errors and the version and claims no clispec conformance" | restated (held for `--schema`); results go with R3 |
| C4 | `recovery-bytes` below commander's with no hint removed, or a report that it could not and why | could not: burgee 164 B, commander 31 B, yargs 458 B (medians) | `benchmarks/results/cli-benchmarks/2026-10-18-cafa069-ci.json`, records `recovery-bytes` | held (reported, below) |
| C5 | `--json` with no argument lists valid fields; an invalid one prints the valid set | as `--json=` (bare `--json` stays a boolean, D-114) | `packages/burgee/src/json-fields.test.ts` › "`--json=` lists the declared fields without running the handler", › "refuses an unknown declared field before running, naming the valid set" | moved → burgee N14 (held) |

What changed, and why:

- **R1, held.** D-061 made compact the default. The test file's header names this intent:
  the property defended is the size of the string, so the test measures the string.
- **R2, C2, C5 → `burgee` N14.** D-114 chose `--json=<a,b>` over a separate `--fields`
  flag. Only the `=` form takes fields, so `cmd --json name` keeps `name` a positional.
  Constraint 3's "`--fields` projects it" is therefore one flag, `--json=`. Projection still
  happens before serialisation: `selectFields` in `packages/burgee/src/fields.ts` runs on the
  result before the envelope is written. Two pieces of R2 did not ship:
  - Dotted paths into a result (`a.b.c`) are **remaining**. Dotted paths exist only for the
    schema, through `--field`.
  - D-063's "`--fields` drops `meta.provenance`" is not how it landed. Selection touches
    `data` only. A caller who wants no `meta` uses `--format=agent`, which has no envelope
    (`agent-format.test.ts` › "is not JSON: no envelope, no meta, no braces").
- **R4, C3 → `burgee` N13.** `Manifest.schemaBudget`, `SCHEMA_BUDGET = 48_000` and
  `summaryOf` carry `summarised: true` and say how to drill. Drilling is
  `--schema <command>`, then `--field <path>` below it (D-116), not `--at <path>`. C3 holds
  for `--schema`. A budget on results is R3's.
- **N15 → `burgee` N15.** D-146 built `--format=agent`, superseding D-115's deferral. It
  measured 1,294 B against `--json`'s 1,882 B on six representative results (31.2% smaller).
  `agent-format.test.ts` › "is smaller over the whole set by a margin, not a rounding error"
  holds it.
- **R3 remaining.** D-062 put the budget on any machine format, and nothing built it.
  `clispec-conformance`'s spec records that `--max-bytes` does not exist, and that intent does
  not build it.
- **R5 remaining.** `packages/burgee/src/manifest.ts` declares an NDJSON output kind only.
  `clispec-conformance` says "R5's `--format=ndjson`, which is not built, and this intent does
  not build it."
- **RF remaining.** No `formats` key is read anywhere in `packages/burgee/src`.
- **R6 restated, and partly remaining.** The two compactions that shipped are shown not to
  touch error content:
  - Compact JSON is whitespace only: the compact and pretty documents parse to equal values.
  - `--format=agent` never renders a failure. A failure without `--json` stays prose on
    stderr, and with `--json` it is still one envelope.

  The Verification table's check was a reliability-axis case asserting every error still
  carries its `hint`. It was not built, and no test asserts that a failing command's `hint`
  survives `--json=<fields>` or `--format=agent`. That lock is **remaining**.
- **R7 restated.** `schema-bytes` is emitted by `benchmarks/axes/reliability.ts`. It is
  banded as `agent-schema-bytes`, which has 282 points in
  `.sdlc/bands/control-bands.history.json`, and it read 4,752 B in
  `2026-10-18-cafa069-ci.json`. That band breached and the watcher opened
  [`control-band-agent-schema-bytes`](../control-band-agent-schema-bytes/intent.md) as a draft
  on 2026-10-12. `recovery-bytes` is published but, by its own note, "reported, never gated —
  a hint costs bytes and may save turns". R7 is restated to that.
- **C1 restated to what is asserted, and the rest kept as remaining.** The tests assert that
  compact and pretty are value-identical, and that compact is more than 30% smaller on a
  fixture document. The test's own comment says the 42% figure belongs to the large demo and
  that the benchmark measures the real document. The benchmark measures the burgee demo, not
  `examples/demo-cli-large`, and it publishes the compact figure only. Two things are
  **remaining**: the 40% on the large demo has no check, and constraint 5's pretty "before"
  figure beside the compact one is not published. The 2026-09-09 hand measurement above
  (39,512 B → 22,964 B, 42%) is still the only record of either.
- **C4, reported.** `recovery-bytes` is the median an agent reads per task across the
  reliability axis's ten tasks on the three demos. burgee reads 164 B against commander's
  31 B and yargs' 458 B (`2026-10-18-cafa069-ci.json`). It did not move below commander's.
  The reason is the one constraint 1 gives and the axis's own note repeats: burgee's failures
  carry a `hint`, a `fix` and, after a runtime failure, the command's usage
  (`packages/burgee/src/failure-teaches.test.ts`). Those cost bytes, and they may save turns.
  Removing them to win this number is the trade constraint 1 refuses. The criterion allows
  exactly this outcome ("or the intent reports that it could not and why"), and this
  paragraph is that report.

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
  published beside the pretty-printed one. **Restated 2026-10-18 (C1):** compact and pretty
  are value-identical and compact is more than 30% smaller, held by `machine-json.test.ts`;
  the compact figure is published as `schema-bytes`. The large-demo 40% and the published
  pretty figure are **remaining**.
- ~~`--fields a,b` projects at the source: the bytes never leave the process.~~
  **Restated 2026-10-18 (C2):** `--json=<a,b>` selects at the source (D-114) — moved to
  `burgee` N14, held by `json-fields.test.ts`.
- A declared budget truncates legibly — the response says it is partial and how to continue —
  and a test proves an agent can tell a truncated response from a complete one.
  **Restated 2026-10-18 (C3):** held for `--schema` (`burgee` N13, `summarised: true`);
  for results it is R3, **remaining**.
- `recovery-bytes` for burgee moves below commander's without any `hint` being removed, or
  the intent reports that it could not and why. **2026-10-18 (C4): reported** — it could
  not (164 B against 31 B); see [§ Restated 2026-10-18](#restated-2026-10-18).
- N14's field listing works: `--json` with no argument lists valid fields; an invalid one
  prints the valid set. **Restated 2026-10-18 (C5):** `--json=` lists them; bare `--json`
  stays a boolean (D-114) — moved to `burgee` N14, held by `json-fields.test.ts`.

## The limitation of our own metric, stated up front

**Bytes are not tokens, and we measure bytes.** A BPE tokenizer encodes a repeated JSON key
efficiently — the second `"status":` costs far less than the first — so a 63% byte saving is
not a 63% token saving. The direction is right; the magnitude is unknown.

Bytes are what can be measured without depending on a particular tokenizer, and a metric that
varies by model cannot ratchet. So: **no token-percentage claim ships until a token count is
measured**, and the benchmarks page says "bytes" wherever it means bytes. Anyone quoting a
token figure from this intent is quoting something nobody measured.

## Open questions

- **Is compact the default for `--schema`, or opt-in?** **Decided 2026-09-20 → D-061.** Proposed: default. Its reader is a
  machine by construction (N8), and `--format=json-pretty` covers the human debugging it.
- **Which formats, and who decides?** **Answered 2026-09-09 by measuring.** On fifty rows of
  four fields: minified JSON 2,749 B, NDJSON 2,747 (0% — its win is streaming), logfmt 2,047
  (26%), Markdown table 1,554 (43%), **TSV with a header 1,018 (63%)**. The whole effect is
  key repetition, so the saving grows with row count and is nil for a single object. And the
  set is not ours to close: a format is data plus one `(value) => string`, which is exactly
  what [`plugin-contract`](../plugin-contract/intent.md) admits, so `formats` becomes a key on
  the shared plugin object and **the CLI's author decides what their agents read**. N15's
  `agent` format is then one registered format among several rather than a built-in.
- **Where does the budget live?** **Decided 2026-09-20 → D-062.** N13 puts it on `--schema`. Proposed: on any machine format,
  because a large result set has the same problem a large schema does.
- **Does `meta.provenance` stay in the default envelope?** **Decided 2026-09-20 → D-063.** It is the whole point of the
  `diagnose-provenance` benchmark task and dead weight in every other. Proposed: keep it, and
  let `--fields` drop it — a default that is right for the task that needs it, projectable
  by the tasks that do not.
