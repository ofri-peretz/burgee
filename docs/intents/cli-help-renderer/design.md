# Design — Help renderer

Intent: [`intent.md`](./intent.md). **Status:** draft.

---

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
