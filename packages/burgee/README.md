<p align="center">
  <a href="https://github.com/ofri-peretz/burgee" target="blank">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/burgee-lockup.svg" />
      <img src="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/burgee-lockup-light.svg" alt="burgee" width="360" />
    </picture>
  </a>
</p>

<p align="center">
  Everything a CLI needs that isn't your CLI. Written once, served to humans and agents alike.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/burgee"><img src="https://img.shields.io/npm/v/burgee?style=flat-square&color=0a6b47" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/burgee"><img src="https://img.shields.io/npm/dm/burgee?style=flat-square" alt="npm downloads" /></a>
  <img src="https://img.shields.io/badge/dependencies-5%20in--family-0a6b47?style=flat-square" alt="Five dependencies, all in this repository: bellpull, closeout, linegauge, roundel, seniority" />
  <img src="https://img.shields.io/badge/Node.js-20.19%2B%20%7C%2022.13%2B-green.svg?style=flat-square" alt="Node.js 20.19+ or 22.13+" />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License: MIT" />
</p>

<p align="center">
  Docs: <a href="https://burgee.interlace.tools/docs/packages/burgee">https://burgee.interlace.tools/docs/packages/burgee</a><br />
  Migrating from: <a href="https://burgee.interlace.tools/docs/vs/commander">commander</a> · <a href="https://burgee.interlace.tools/docs/vs/yargs">yargs</a>
</p>

A **burgee** is the small swallowtail flag a boat flies to say which club or fleet it
belongs to — a flag of identity, not of instruction. That is what this framework does for
a command-line program: a command declares itself once, and every surface is that
declaration read by a different reader.

It replaces **commander** and **yargs**: `burgee/commander` and `burgee/yargs` are drop-in,
graded by each one's own test suite. Change one import and the same program answers agents
too — `--json` for results, `--schema` for the command tree, `--mcp` for an MCP server.

## Start here

```bash
npm install burgee
```

```js
// cli.mjs — the whole CLI
import { defineCommand, run } from 'burgee';

run(defineCommand({
  name: 'greet',
  description: 'Greet someone by name',
  options: { name: { type: 'string', required: true, description: 'who to greet' } },
  effects: 'read_only', // what running it does to the world; required, and what --mcp reads
  run: ({ options }) => ({ greeting: `hello, ${options.name}` }),
}));
```

```console
$ node cli.mjs --name ada
greeting: hello, ada

$ node cli.mjs --json --name ada
{"ok":true,"data":{"greeting":"hello, ada"},"meta":{"provenance":{"name":{"source":"flag","location":"--name"}}}}

$ node cli.mjs            # exit 2
error: missing required option --name
hint: pass --name <value>
```

One file. No build step, no config file, no directory convention. A test enforces
that on every commit.

## One declaration, every surface

```text
defineCommand()  ──▶  manifest  ──┬──▶  human help
                                  ├──▶  --json      one stable envelope
                                  ├──▶  --schema    versioned, one document per surface
                                  ├──▶  --mcp       an MCP server, generated
                                  ├──▶  completions bash · zsh · fish · pwsh
                                  ├──▶  TypeScript types
                                  └──▶  docs + llms.txt
```

Nothing here needs keeping in sync, because nothing is written twice.

## Already on commander?

Drop-in compatible with both incumbents, graded by **their own test suites** — 1,360 / 1,360
of commander's tests and 804 / 804 of yargs' on the
[compatibility page](https://burgee.interlace.tools/docs/compatibility) — with the pass rate
published and ratcheting:

```diff
- import { Command } from 'commander';
+ import { Command } from 'burgee/commander';
```

Your code and your tests are unchanged. A façade is never called "compatible" until its
host's own suite passes 100%; below that the rate is published instead of claimed.

Or let the codemod make that change, and the same one for chalk, ora, string-width,
cross-spawn, signal-exit and every other incumbent the family replaces at full grade:

```bash
npx burgee migrate --dry-run
npx burgee migrate
```

It rewrites import specifiers and nothing else, leaves a replacement that is not level yet
alone with its grade, refuses a file it cannot rewrite whole, and prints the install command
to run next — [Migrate](https://burgee.interlace.tools/docs/migrate).

## What is in the box

| Import | Gives you |
| :-- | :-- |
| `burgee` | `defineCommand()`, `run()`, the exit-code contract and the JSON envelope. |
| `burgee/commander` | The commander API, graded by commander's suite. |
| `burgee/testing` | Run a command in-process and assert on its result — no spawning. |
| `burgee/brand` | One brand declaration → flag, favicon, OG card, cover, lockup. The logo above is its own output. |
| `burgee/plugin` | `definePlugin()`, `validate()`, `CONTRACT` and `PluginError` — the host, at the subpath every package in the family publishes its host at. |

## Writing a plugin

```ts
import { definePlugin } from 'burgee/plugin';

export default definePlugin({
  name: 'acme',
  commands: [{ path: ['audit'], description: 'Audit the tree', options: {}, effects: 'read_only', run: () => ({ findings: 0 }) }],
});
```

A plugin's command is read by exactly the code a first-party one is read by, so the same
refusals apply: reserved option names, duplicate flags, a contributed path that is already
declared — and `effects`, which every runnable command declares. `definePlugin` stamps the
`contract` this burgee was compiled against; an object that reaches `use()` without one is
refused rather than accepted on trust, because burgee's extension point shipped before it
validated anything.

## Status

`burgee` is published and working: the engine, the exit-code contract, the JSON envelope,
help from the manifest, plugins with hook filters, and a `burgee/commander` façade that
runs a real commander program. The dev loop, prompts, lazy commands and groups are not
here yet.

Roadmap, architecture and the 114-requirement floor:
<https://github.com/ofri-peretz/burgee>

## FAQ

### Is burgee a commander alternative?

Yes — and a yargs alternative. It is drop-in compatible with both: change
`import { Command } from 'commander'` to `import { Command } from 'burgee/commander'` (or
`yargs` to `burgee/yargs`) and your code and tests are unchanged. Compatibility is graded by
each host's own test suite in CI, not asserted. Side by side:
[burgee vs commander](https://burgee.interlace.tools/docs/vs/commander) and
[burgee vs yargs](https://burgee.interlace.tools/docs/vs/yargs).

### How do I make my CLI usable by an AI agent?

Declare it with `defineCommand()` — or keep it on commander or yargs syntax through the
drop-in front ends. Every command then answers `--json` with one stable envelope,
`--schema` with the whole command tree as data, and exits `2` when the *command* was wrong
so an agent knows to rewrite it rather than retry. None of it is written by hand; it is
the declaration read by a different reader.
[Your CLI is an agent tool](https://burgee.interlace.tools/docs/agent-surfaces) has each surface.

### How do I expose a CLI over MCP?

Run it with `--mcp`: the same manifest is served as MCP tools over stdio. Every runnable
command declares its `effects` — `read_only`, `idempotent` or `non_idempotent`, which become
MCP's hints, or `withheld`, which keeps it out of the tool list — so nothing reaches an
agent by accident. On `burgee/commander` and `burgee/yargs`, a command that declared
nothing is still listed, marked `effects: 'undeclared'`. Register it with any stdio client:

```json
{ "mcpServers": { "mytool": { "command": "npx", "args": ["mytool", "--mcp"] } } }
```

### Does it have dependencies?

None outside the burgee family. `burgee` installs five packages from that family —
`bellpull`, `closeout`, `linegauge`, `roundel` and `seniority` — and each of those takes
nothing from outside it either: one repository, one release pipeline, one supply chain to
audit.

---

Part of the [burgee](https://github.com/ofri-peretz/burgee) family: a CLI on burgee declares
what it is, [roundel](https://www.npmjs.com/package/roundel) carries its colours,
[flagstaff](https://www.npmjs.com/package/flagstaff) flies it, and
[caique](https://www.npmjs.com/package/caique) answers back. Each is an independent package;
none requires the others.

MIT © Ofri Peretz — see [LICENSE](./LICENSE).

## Benchmarks

Every number here is produced by `npm run bench` and published at [/docs/benchmarks](/docs/benchmarks).

Graded by the incumbent's own test suite:

| suite | passing |
| :-- | --: |
| `commander` | 1360 / 1360 |
| `meow` | 132 / 148 |
| `yargs` | 804 / 804 |
## Where it sits

Plugins register under the `commands` and `hooks` keys, against the one schema the whole family shares.

Nothing in this family builds on it yet, and it builds on `bellpull`, `closeout`, `linegauge`, `roundel`, `seniority`.
