# Intent — One help renderer, from data, that answers the twenty open help issues

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md).
> Research §2, the largest cluster (roughly a fifth of yargs' tracker). F2 makes help
> data; this makes the text good. Proposes floor additions H1–H6.

**Status:** shipped · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz

**State assigned 2026-09-09** from repo evidence, at the owner’s direction. **Evidence:** `help.ts` + `help.test.ts`, rendered from the manifest (H1–H6).

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

None open. Decided at finalisation (2026-09-06):

- **Floor additions H1–H6 are adopted.**
- **Markdown output ships in the same package** (R6); man-page output does not. The docs
  site consumes the Markdown renderer to publish the demo's help.
