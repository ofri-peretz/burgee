# Intent — One help renderer, from data, that answers the twenty open help issues

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md).
> Research §2, the largest cluster (roughly a fifth of yargs' tracker). F2 makes help
> data; this makes the text good. Proposes floor additions H1–H6.

**Status:** review · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz

---

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
- Rendered help for the demo fits 100 columns with no line wrapped mid-command.
- `commander-agent` and `yargs-agent` render byte-identical help for the two demos
  (allow-listed differences as in `yargs-agent/design.md`).

## Open questions

None open. Decided at finalisation (2026-09-06):

- **Floor additions H1–H6 are adopted.**
- **Markdown output ships in the same package** (R6); man-page output does not. The docs
  site consumes the Markdown renderer to publish the demo's help.
