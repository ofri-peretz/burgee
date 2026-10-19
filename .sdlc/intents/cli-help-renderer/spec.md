# Design — Help renderer

Intent: [`intent.md`](./intent.md). **Status:** review.

**Restated:** 2026-10-18 — see § Restated 2026-10-18

---

## Restated 2026-10-18

**R1–R7 restated to `packages/burgee/src/help.ts` and all held; the two cross-host Verification items are restated — the intent stays REMAINING only on its S1 min/max annotations.**

| ID | promised | on main | check | disposition |
| :-- | :-- | :-- | :-- | :-- |
| R1 | `renderHelp(node, { width, color, verbose, locale })`, pure | `renderHelp(manifest, node, { width, verbose, color, theme, commands, format })`; the locale is resolved by the engine, not passed | `packages/burgee/src/help.test.ts` › "is byte-identical with and without a theme when colour is off, which is the default"; `packages/burgee/src/help.test.ts` › "in German under LANG=de_DE.UTF-8: description, summary, option and example" | restated |
| R2 | fixed section order, empty ones omitted | yes | `packages/burgee/src/help.test.ts` › "lists every section in the fixed order, empty ones omitted (R2)" | held |
| R3 | term column up to 40% of width, two-space gutter, terms never wrapped | yes, measured in display width | `packages/burgee/src/help.test.ts` › "fits %d columns with no term wrapped and one aligned description column (R3, H3, yargs #2204)"; `packages/burgee/src/help-width.test.ts` › "starts every description at the same terminal column, whatever the term is made of" | held |
| R4 | trailing annotations in a stable order, type only with `verbose` | `(required) (default) (one of) (repeatable) (requires) (conflicts with) [env] [type] (deprecated)` | `packages/burgee/src/help.test.ts` › "annotates defaults, choices, env and placeholder in a stable order (R4, yargs #1408, #833, #1935)"; `packages/burgee/src/help-annotations.test.ts` › "marks a required option" | restated |
| R5 | `$ <command line>` on its own line, description below | yes | `packages/burgee/src/help.test.ts` › "puts each example on one copy-pasteable line, description below (H2, R5, yargs #877)" | held |
| R6 | `renderMarkdown(node)` sharing the section model | `renderHelp(…, { format: 'markdown' })`, built by `agent-skill` R1 | `packages/burgee/src/help.test.ts` › "lays out a heading, a usage block, tables and fenced examples, with the exit-code table at the root"; › "a mutation that drops a section from one target is caught" | restated |
| R7 | colour only when `opts.color`, never in manifest names | yes, as `color` plus a `theme` seam shaped like roundel's tokens (roundel is not imported), and the engine decides `color` by O2 | `packages/burgee/src/help.test.ts` › "never colours a name in the manifest: colour wraps the rendered cell after it is measured (yargs #1699)"; `packages/burgee/src/help.test.ts` › "the engine colours help by O2 alone: ANSI is all it adds, and NO_COLOR removes it" | restated |

- **R7** is no longer "not yet" as the 2026-09-07 status table says: colour shipped as
  `color` + `theme` options with built-in default tokens, a theme seam shaped like roundel's
  rather than `util.styleText` calls.
- **Verification.** "Snapshot suite per requirement row at widths 60, 80, 100, 120" shipped as
  `packages/burgee/src/help-snapshot.test.ts` at 33, 80 and 120 (the widths where the layout
  changes), plus `help.test.ts`'s `it.each(WIDTHS)` width row. "Cross-host byte-identity test on
  the demos" is reversed: the `X7` parity suites in `examples/conformance/src/` grade each
  front-end against its own incumbent (see the intent's S3). "Markdown validated by
  `markdownlint-cli2` in the test" was not built; the Markdown is held structurally by the R6
  checks above, including a mutation case.

## Requirements

- **R1** `renderHelp(node: CommandNode, opts: { width, color, verbose, locale })` →
  string; pure.
- **R2** Sections in fixed order: usage, description, arguments, command options,
  global options, commands (grouped), examples, environment, epilogue; empty sections
  omitted.
- **R3** Column layout: term column sized to the longest term up to 40% of width, a
  two-space gutter, descriptions wrapped to the remainder; commands never wrapped in
  the term column (yargs #2204).
- **R4** Type hints, defaults, choices, env, deprecation rendered as trailing
  annotations in a stable order: `(default: x) (one of: a, b) [env: X] (deprecated: use y)`;
  type hints only with `verbose`.
- **R5** `examples[]` rendered `$ <command line>` on its own line, description
  indented below; never in two columns.
- **R6** `renderMarkdown(node)` for docs generation (yargs #2121) sharing the same
  section model.
- **R7** Colour through `util.styleText` and only when `opts.color`; names are never
  coloured in the manifest itself (yargs #1699).

## Design

```
packages/cli-core/src/help/
  model.ts      CommandNode → HelpSections (pure data, no strings)
  text.ts       HelpSections → string (width-aware)
  markdown.ts   HelpSections → Markdown
  wrap.ts       word wrap preserving leading whitespace (yargs #2120)
```

Hosts install it: commander via `configureHelp({ formatHelp: (cmd) =>
renderHelp(walk(cmd), …) })`; yargs by intercepting `--help` in the before-validation
middleware and printing `renderHelp(node)` instead of calling `showHelp`.

`help <cmd>` is synthesised by the agent layers as a hidden command that renders the
target node.

## Status (2026-09-07)

| Req | State | Where |
| :-- | :-- | :-- |
| R1 | `renderHelp(manifest, node, { width, verbose })`, pure. No `color`/`locale` yet: colour is R7, locale waits for a first localised adopter | `packages/burgee/src/help.ts` |
| R2 | fixed order, empty sections omitted | `help.test.ts` "fixed order" |
| R3 | one term column for the whole help (≤ 40% of width), two-space gutter, wrapped descriptions, terms never wrapped | "fits N columns" at 60/80/100/120 |
| R4 | `(required) (default: x) (one of: a, b) [env: X] [type]` then `(deprecated: use y)`; type only with `verbose` (H6) | "annotates …", "type hints off" |
| R5 | `$ command` on one line, description below | "copy-pasteable line" |
| R6 | Markdown output — deferred on 2026-09-07 (its consumer was the docs site, and shipping it in core spends the core byte budget on a dev-time surface). **Built 2026-10-12 by [`agent-skill`](../agent-skill/spec.md) R1**, its consumer: `renderHelp(manifest, node, { format: 'markdown' })` resolves to the same `helpModel` sections laid out as Markdown, from `help-markdown.ts` behind an `await import()`, so the `./help` door pays for the branch only (9,018 → 9,019 B of 9,130) | `packages/burgee/src/help.ts`, `help-markdown.ts`; `help.test.ts` › `help renders as Markdown, from the same sections (agent-skill R1)` |
| R7 | colour — not yet; names are never coloured in the manifest, so it is purely additive. *Built since; see § Restated 2026-10-18* | — |
| H3 | width from the injected stdout's `columns`, else 100 | "takes its width from the injected stdout" |
| `help <cmd>` | synthesised in the engine for every program (yargs #1020) | "help through the engine" |
| N15 | agent output format — deferred to wave 3, and **owned by [`agent-headroom`](../agent-headroom/intent.md) from 2026-09-09**, which is where `--format` is decided once. It stays an open question there rather than a commitment: compact JSON is measured first, and a second format has to earn its place against that number | — |

The commander front-end keeps commander's own help by default (byte-identical is the
contract, X7); this renderer is available to it as an opt-in through `configureHelp` in a
later step.

## Verification

- Snapshot suite per requirement row from the intent, at widths 60, 80, 100, 120.
- Cross-host byte-identity test on the demos (allow-list).
- Markdown output validated by `markdownlint-cli2` in the test.

## Rejected alternatives

- **Extending commander's `Help` class.** Host-specific; yargs would need a second
  implementation and drift is guaranteed.
- **Templating (handlebars-style).** A template cannot compute column widths; the
  section model plus a small layout function is smaller than a template engine.

## Out of scope

- Man-page (`roff`) output; Markdown is enough for docs generators.
- Pager integration.
