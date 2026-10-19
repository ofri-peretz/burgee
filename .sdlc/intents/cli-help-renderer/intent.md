# Intent — One help renderer, from data, that answers the twenty open help issues

> Stage 1 artifact. Child of [`burgee`](../burgee/intent.md).
> Research §2, the largest cluster (roughly a fifth of yargs' tracker). F2 makes help
> data; this makes the text good. Proposes floor additions H1–H6.

**Status:** review · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz

**State assigned 2026-09-09** from repo evidence, at the owner’s direction. **Evidence:** `help.ts` + `help.test.ts`, rendered from the manifest (H1–H6).

**Restated:** 2026-10-18 — see § Restated 2026-10-18

---

## Restated 2026-10-18

**Criteria restated to the shipped `burgee` help renderer (`packages/burgee/src/help.ts`); S2 held, S3 restated to the incumbent-parity contract, S1 held row by row except one half-row — REMAINING: S1 min/max annotations in help.**

The renderer is `renderHelp(manifest, node, opts)` in `packages/burgee/src/help.ts`, not
`@interlace/cli-core/src/help/`, and it is installed by burgee's own engine, not by
`commander-agent` / `yargs-agent` (both dropped 2026-09-06 when the engine became the
product; their requirements moved to `replacement-parser` and `commander-compat`). The
`burgee/commander` and `burgee/yargs` front-ends print their incumbents' help, byte for byte.
The success-criteria bullets are numbered S1–S3 here in their order.

| ID | promised | on main | check | disposition |
| :-- | :-- | :-- | :-- | :-- |
| S1 | every table row has a snapshot case on the demo | 18 of 19 rows have a named assertion, and six fixture shapes (one of them the demo's commands) are drawn at 33, 80 and 120 columns and pinned | `packages/burgee/src/help-snapshot.test.ts` › "help is a drawing, and the drawing is pinned (PLAN 2.5.1)", plus the per-row table below | restated; the min/max half of one row remaining |
| S2 | demo help fits 100 columns, no line wrapped mid-command | yes | `packages/burgee/src/help.test.ts` › "fits %d columns with no term wrapped and one aligned description column (R3, H3, yargs #2204)"; `packages/burgee/src/help-width.test.ts` › "never draws a line wider than the width it was given, at every width" | held |
| S3 | `commander-agent` and `yargs-agent` render byte-identical help for the two demos | no — reversed: each front-end is byte-identical to its own incumbent | `examples/conformance/src/commander-parity.test.ts` › "X7 · burgee/commander is byte-identical to commander on the demo" (cases "--help", "greet --help", "help greet"); `examples/conformance/src/yargs-parity.test.ts` › "X7 · burgee/yargs is byte-identical to yargs on the demo" (cases "--help", "greet --help") | reversed by the competitor decision (`commander-agent/intent.md`, superseded 2026-09-06) |

Per-row evidence for S1 (the table under § What is wanted, in its order):

| Row | check | disposition |
| :-- | :-- | :-- |
| group headings (#684), script name once (#1964), summary vs description (#1265) | `packages/burgee/src/help.test.ts` › "groups commands under headings and lists them bare, with the summary (yargs #684, #1964, #1265)" | held |
| type hints off (#969, #427) | `packages/burgee/src/help.test.ts` › "keeps type hints off unless verbose (H6, yargs #969, #427)" | held |
| examples on one line (#877) | `packages/burgee/src/help.test.ts` › "puts each example on one copy-pasteable line, description below (H2, R5, yargs #877)" | held |
| width from the stream, else 100 (#2003, #2204) | `packages/burgee/src/help.test.ts` › "takes its width from the injected stdout when it has columns (H3)" | held |
| two-space gutter (#2228) | `packages/burgee/src/help-snapshot.test.ts` › "help is a drawing, and the drawing is pinned (PLAN 2.5.1)" (every drawing pins the gutter byte for byte) | held |
| leading spaces kept (#2120) | `packages/burgee/src/help.test.ts` › "keeps an author-indented description verbatim (yargs #2120)" | held |
| command options before global (#1181) | `packages/burgee/src/help.test.ts` › "renders command options before global options (H4, yargs #1181)" | held |
| choices and `(repeatable)` (#1408, #1349) | `packages/burgee/src/help.test.ts` › "annotates defaults, choices, env and placeholder in a stable order (R4, yargs #1408, #833, #1935)"; `packages/burgee/src/help-annotations.test.ts` › "marks a repeatable option" | held |
| value placeholder (#833) | `packages/burgee/src/help.test.ts` › "annotates defaults, choices, env and placeholder in a stable order (R4, yargs #1408, #833, #1935)" | held |
| colour never in names (#1699) | `packages/burgee/src/help.test.ts` › "never colours a name in the manifest: colour wraps the rendered cell after it is measured (yargs #1699)" | held |
| subcommand help and `help <sub>` (#1500, #1020) | `packages/burgee/src/help.test.ts` › "--help on a command, help <command>, and the root all render from the same renderer" | held |
| deprecated inline (#2248) | `packages/burgee/src/help.test.ts` › "hides hidden commands and options, and marks deprecated ones inline (yargs #2248)" | held |
| positional defaults (#2012) | `packages/burgee/src/help.test.ts` › "documents positionals with their defaults in the same column (yargs #2012)" | held |
| epilogue per node (#1680) | `packages/burgee/src/help.test.ts` › "lists every section in the fixed order, empty ones omitted (R2)" | held |
| `dependsOn` and `exclusive` in help (oclif #1001, #1002) | `packages/burgee/src/option-relations.test.ts` › "help says it on the option’s own line" (`(requires --force)`, `(conflicts with --table)`) | held |
| `min` / `max` in help (oclif #1001) | none: `minimum` and `maximum` are declared (`definition.ts`) and published in `--schema` (burgee N9), but `annotate()` in `help.ts` renders neither | remaining |
| env vars, `[env: X]` and an `Environment` section (#1935) | `packages/burgee/src/help.test.ts` › "annotates defaults, choices, env and placeholder in a stable order (R4, yargs #1408, #833, #1935)" | held |

- **S1 (restated).** "A snapshot case on the demo" is restated to what shipped: a named
  assertion per row against the fixture program in `help.test.ts`, plus the snapshot suite
  that pins six shapes at three widths, one of them the demo's `greet` / `config get` / `fail`
  commands. The 2026-09-09 finding that there were no help snapshots and that `dependsOn` /
  `exclusive` appeared nowhere is no longer true on FETCH_HEAD; both are now held. The one
  unbuilt piece is rendering a number option's `minimum` / `maximum`, which no other intent
  covers, so it stays here.
- **S3 (reversed).** Cross-front-end identity is impossible under the contract that shipped:
  commander and yargs format help differently, and each burgee front-end is graded byte for
  byte against its own incumbent. The criterion is rewritten to that parity contract, which the
  two `X7` suites hold.
- **R6 Markdown**, recorded as unbuilt on 2026-09-09, was built 2026-10-12 by
  [`agent-skill`](../agent-skill/spec.md) R1; see [`spec.md`](./spec.md) § Restated 2026-10-18.

## What is wanted

A host-neutral help renderer in `@interlace/cli-core` that takes a `CommandNode` (the
F1 manifest) and produces text, used by both `commander-agent` and `yargs-agent`
through their `configureHelp` / `getHelp` seams. It fixes, by construction:

| Ask | Issue | Behaviour |
| :-- | :-- | :-- |
| Group commands under headings | yargs #684 (34 reactions, 2016) | `group` from the manifest renders sections |
| Hide `[boolean]`/type hints | yargs #969, #427 | type hints off by default, `--help --verbose` shows them |
| Script name repeated per command | yargs #1964 | usage line once, commands listed bare |
| Examples on one copy-pasteable line | yargs #877, #1640, #1047 | `examples[]` rendered `$ cmd …` then description below |
| Width hard-coded to 80 | yargs #2003, #2204 | `runtime.stdout.columns` or 100 in non-TTY, never wraps commands at half width |
| Column separation | yargs #2228 | two-space gutter minimum |
| Leading spaces stripped from usage | yargs #2120, #2000 | description text is verbatim |
| Command options before global | yargs #1181 | order: arguments, command options, global options |
| Choices and array defaults documented | yargs #1408, #1349 | `(one of: a, b, c)` and `(repeatable)` |
| Value placeholder | yargs #833 | `--id <dataset-id>` from the schema's `placeholder` |
| Colour in a command name breaks matching | yargs #1699 | colour applied at render, never in names |
| Subcommand help missing examples/options | yargs #1500, #1331, #1025 | every node renders the same way |
| `cmd help <sub>` | yargs #1020 | `help` is a synthesised command |
| Deprecated shown | yargs #2248 | `(deprecated: use …)` inline |
| Positional defaults shown | yargs #2012 | same column as options |
| Short vs long description | yargs #1265 | `summary` in lists, `description` on the command's own help |
| Epilogue per command | yargs #1680 | `epilogue` per node |
| min/max, dependsOn, exclusive in help | oclif #1001, #1002 | from `commander-schema` relations |
| Env vars documented | yargs #1935, #1681 | `[env: REGION]` per option and an `Environment` section |

## Why now

- It is the biggest cluster and every entry is a renderer change once help is data.
  F2 lands the data in `commander-agent`; without this intent the text stays
  commander's default and the twenty issues stay open for our users too.
- Agents read text help when `--schema` is unavailable (older tools calling through
  us) — a dense, consistent layout is fewer tokens.

## Affected users and systems

- `@interlace/cli-core/src/help/` (renderer, host-neutral); `commander-agent`
  `configureHelp({ formatHelp })`; `yargs-agent` `getHelp()` replacement.
- The docs site shows rendered help for the demo next to its `--schema`.

## Constraints

1. Output is deterministic for a given node and width; a snapshot suite pins it.
2. No dependency on the host's help classes beyond the seam to install the renderer.
3. Width from `Runtime`, never from `process.stdout` directly.
4. Localised descriptions (yargs #2094) are supported as `description: Record<locale,
   string>` in the node with a `locale` render option; no translation shipped.

## Success criteria

- Every row above has a snapshot case on the demo showing the behaviour.
  **Restated 2026-10-18 (S1):** every row has a named assertion and the help drawing is
  snapshot-pinned at 33, 80 and 120 columns (`packages/burgee/src/help-snapshot.test.ts`);
  `min` / `max` in help is **remaining**. Per-row evidence in § Restated 2026-10-18.
- Rendered help for the demo fits 100 columns with no line wrapped mid-command.
  **Held (S2)** by `packages/burgee/src/help.test.ts` › "fits %d columns with no term
  wrapped and one aligned description column (R3, H3, yargs #2204)".
- ~~`commander-agent` and `yargs-agent` render byte-identical help for the two demos
  (allow-listed differences as in `yargs-agent/spec.md`).~~
  **Restated 2026-10-18 (S3):** `burgee/commander` renders help byte-identical to
  commander, and `burgee/yargs` to yargs, on the demo — held by
  `examples/conformance/src/commander-parity.test.ts` and
  `examples/conformance/src/yargs-parity.test.ts` (the `X7` suites).

## Verified against `main` — 2026-09-09

Checked criterion by criterion on `61bd11b9`. **One of three met; one is stale and inverted.**
The status stays `review`.

- **Every row of the table has a snapshot case on the demo** — not met. There are no help
  snapshots at all (`packages/burgee/src/__snapshots__/` holds only `completions.test.ts.snap`);
  the sixteen cases in `help.test.ts` are assertions against a fixture program, not the demo.
  Three rows have no test of any kind: the two-space gutter (yargs #2228, `GUTTER = 2` at
  `help.ts:87`), array defaults rendering `(repeatable)` (yargs #1349, `help.ts:108`), and
  `min`/`max`/`dependsOn`/`exclusive` in help (oclif #1001, #1002) — the last of which is not
  implemented at all: `dependsOn`, `exclusive` and `conflicts` appear nowhere in `help.ts`,
  `validate.ts` or `manifest.ts`.
- **Rendered help fits 100 columns with no line wrapped mid-command** — **met.** Widest line
  measured: 33 characters on `demo-cli-burgee`, 56 on `demo-cli-large` (33 commands).
- **`commander-agent` and `yargs-agent` render byte-identical help for the two demos** —
  **stale, and reversed by a later decision.** Both packages it names are dropped intents, and
  the contract that shipped is the opposite one: `examples/conformance/src/commander-parity.
  test.ts:41` and `yargs-parity.test.ts:38` assert that `burgee/commander` is byte-identical to
  **real commander** and `burgee/yargs` to **real yargs**. Since the two incumbents' help
  formats differ from each other, the two front-ends necessarily differ too — verified by
  diffing the demos (commander prints `Usage: demo [options] [command]`, yargs prints
  `demo <command>` with `[boolean]` type hints). This criterion should be rewritten to the
  parity contract that replaced it, not reinterpreted.

Also unbuilt, though not a success criterion: the finalisation decision that "Markdown output
ships in the same package (R6)" and that the docs site consumes the Markdown renderer —
`help.ts` has no Markdown path.

## Open questions

Decided — none open. The items below were settled when this intent was written and are
kept as the record they always were (confirmed 2026-09-20, D-072).

None open. Decided at finalisation (2026-09-06):

- Decided: **Floor additions H1–H6 are adopted.**
- Decided: **Markdown output ships in the same package** (R6); man-page output does not. The docs
  site consumes the Markdown renderer to publish the demo's help.
