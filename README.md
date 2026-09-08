# burgee

A **CLI framework that replaces commander and yargs**, is drop-in compatible with both, and
serves every command through every format a caller wants — from one declaration.

```js
// cli.mjs — the whole CLI. No build step, no config, no scaffold.
import { defineCommand, run } from 'burgee';

run(defineCommand({
  name: 'greet',
  description: 'Greet someone by name',
  options: { name: { type: 'string', required: true, description: 'who to greet' } },
  run: ({ options }) => ({ greeting: `hello, ${options.name}` }),
}));
```

```console
$ node cli.mjs --name ada
greeting: hello, ada

$ node cli.mjs --name ada --json
{"ok":true,"data":{"greeting":"hello, ada"}}

$ node cli.mjs                                    # exit 2, not 1
error: missing required option --name
hint: pass --name <value>
```

A **burgee** is the small swallowtail flag a boat flies to say which club it belongs to — a
flag of identity, not of instruction. That is what a command does here: declares itself
once, and every surface is that declaration read by a different reader.

## One declaration, every surface

```text
defineCommand()  ──▶  manifest  ──┬──▶  human help
                                  ├──▶  --json      one stable envelope
                                  ├──▶  --schema    versioned, JSON-Schema validated
                                  ├──▶  --mcp       an MCP server, generated
                                  ├──▶  completions bash · zsh · fish · pwsh
                                  ├──▶  TypeScript types
                                  └──▶  docs + llms.txt
```

Surfaces cannot drift, because there is nothing to keep in sync. Adding the next one is an
emitter, not a feature.

## Already on commander? Change one import

```diff
- import { Command } from 'commander';
+ import { Command } from 'burgee/commander';
```

Your code and your tests are unchanged — compatibility is graded by **commander's own 1,215
tests** and yargs' 1,185, run in our CI as a published pass rate that only goes up. And you
immediately gain something commander cannot sell you at any price: **plugins**. Its plugin
RFC ([#2505](https://github.com/tj/commander.js/issues/2505)) has been open and unanswered
for years; yargs has none at all.

A plugin contributes to the manifest, and the manifest never records which façade filled
it — so one plugin works on commander syntax, yargs syntax and native alike.

## A better commander, not another oclif

oclif has every capability on this page and does **10.9M downloads a week against
commander's 508M**. The difference is not features, it is shape. So the shape is locked
first, ahead of every other requirement, and `Z1` is a **test**: it installs the published
tarball into a temp directory, writes exactly one file, and runs it. The day that needs a
second file, a config or a build step, CI goes red.

Everything beyond that first rung — precomputed manifests, plugins, the dev loop, scaffolding
— is additive and removable.

## Measured

Node 24, darwin/arm64, medians of 25 spawns, 2026-09-07:

| | burgee | commander | yargs | @oclif/core |
| :--- | ---: | ---: | ---: | ---: |
| Runtime dependencies | **0** | 0 | 6 | 18 |
| Import cost over bare node | **+9 ms** | +20 ms | — | **+131 ms** |
| Full CLI run over bare node | **+6 ms** | +16 ms | +84 ms | — |

The speed comes from `node:util.parseArgs` being in the standard library, not from a faster
language: burgee is TypeScript, like both incumbents. Full table in
[`apps/docs/content/docs/comparison.mdx`](./apps/docs/content/docs/comparison.mdx).

## Layout

| Path | Purpose |
| :-- | :-- |
| [`packages/burgee/`](./packages/burgee/) | The framework. `burgee` is the engine, `burgee/commander` the compat façade, `burgee/testing` the in-process harness (T1). |
| [`packages/roundel/`](./packages/roundel/) | **roundel** — the colours a CLI carries: `roundel/policy` (`outputMode`, `colorLevel`), `roundel/tokens` (nine semantic tokens), `roundel/theme` (`fly()`, contrast-checked), `roundel/contrast`, and `roundel/chalk` — chalk 6's API over the tokens, graded by chalk's own suite (47 / 58; the rest is `FORCE_COLOR` on a pipe, refused by the policy). Intent in [`.sdlc/intents/roundel/`](./.sdlc/intents/roundel/). |
| [`packages/flagstaff/`](./packages/flagstaff/) | **flagstaff** — the staff the flag flies from: a frame loop with a static projection for agents, and the plugin host for spinners, progress, boxes and tables. Reserved; see [`.sdlc/intents/flagstaff/`](./.sdlc/intents/flagstaff/). |
| [`packages/caique/`](./packages/caique/) | **caique** — the parrot that always answers back: prompts that are flags first and never hang. Reserved; see [`.sdlc/intents/caique/`](./.sdlc/intents/caique/). |
| [`packages/compat-oracle/`](./packages/compat-oracle/) | Internal, never published. Grades compatibility using the hosts' own suites, plus reference drivers that run the real incumbents for byte-for-byte comparison. |
| [`examples/`](./examples/) | Demo CLIs and the conformance suite that runs every floor case on every host. |
| [`apps/docs/`](./apps/docs/) | Documentation site (Next.js + fumadocs). |
| [`.sdlc/intents/`](./.sdlc/intents/) | Stage 1 + 2 artifacts of the AI-native SDLC: `intent.md` + `design.md` per change, and the wave plan. |
| [`.sdlc/research/`](./.sdlc/research/) | The evidence everything above rests on. |

### The research

Every claim in the design traces to one of these, and each records what it could **not**
determine as well as what it found.

- [`competitor-landscape.md`](./.sdlc/research/competitor-landscape.md) — the measured map:
  downloads, cold start, the compatibility bill, and why we implement rather than wrap.
- [`tracker-gap-analysis.md`](./.sdlc/research/tracker-gap-analysis.md) — every open item in
  both trackers. Commander has 8; yargs has 211, 86% predating 2023. Six issues over nine
  years ask for machine-readable command structure, and the state of the art is
  regex-scraping `--help`.
- [`agent-requirements.md`](./.sdlc/research/agent-requirements.md) — what agents need, and
  **three widely-quoted claims that do not survive verification**.
- [`cli-market-requirements.md`](./.sdlc/research/cli-market-requirements.md) — ten production
  CLIs taken apart, including what the security market requires and where both leading
  scanners get it wrong.
- [`architecture.md`](./.sdlc/research/architecture.md) — the diagrams.
- [`lineage.md`](./.sdlc/research/lineage.md) — the six projects we follow, each reduced to a
  commitment.

## Status

**Published:** `burgee` on npm. **Working today:** the engine, the exit-code contract, the
JSON envelope, help from the manifest, plugins with hook filters, and a `burgee/commander`
façade that runs a real commander program. Four locks — shape, process-reference, weight
per entry point, and the adoption ladder — each proven to fail before it passed.

**Next:** the compatibility oracle, and the remaining commander surface. A compat façade
does not reach 1.0 until its host's own suite passes **100%** (`C7`); below that it ships
pre-1.0 with the rate published and is never called "compatible".

**Not yet true:** the dev loop, prompts, lazy commands and groups, an adopter we did not
write. The [floor](./apps/docs/content/docs/the-floor.mdx) is 101 requirements; the
surfaces, the env/config/schema families and both façades are built, the rest is wave 4.

```bash
npm install
npm test          # every lock and unit test, exits non-zero on failure
npm run dev       # docs on http://localhost:3100
```

## Dogfooding

This repo runs 11 Interlace ESLint plugins with **every rule on at `error`** and zero
warnings allowed: `secure-coding`, `node-security`, `conventions`, `import-next`,
`maintainability`, `modernization`, `modularity`, `operability`, `reliability`,
`react-a11y`, `react-features`. The rule list is computed from each plugin's own table, so a
rule shipped in a plugin release is on here the day it lands. Every exception is named in
`eslint.config.mjs` with its reason.

It earns its keep. During this project those rules caught a prototype-pollution vector in
our own option parsing, a barrel import that cost ~5ms of startup, and a façade reaching for
`process` behind the runtime seam.

MIT © Interlace
