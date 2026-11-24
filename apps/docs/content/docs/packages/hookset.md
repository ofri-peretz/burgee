---
title: hookset
description: "Git hooks presets for AI coding agents: lefthook presets pulled by a pinned tag, a Claude Code hook pack that denies skipped hooks, and `hookset init` and `check`. No dependency outside the burgee family. A husky migration path."
---

**hookset** puts the same verification stations in every repository: lefthook presets for
`commit-msg`, `pre-commit` and `pre-push`, pulled through lefthook `remotes` at a pinned
`hookset@<version>` tag, and a Claude Code hook pack that denies a skipped hook, a moved
`core.hooksPath` and a hand-rolled CI polling loop. Each preset step calls the repository's own
script by a declared name, so the preset is the same everywhere and the repository decides what
runs. `hookset init` writes the smallest `lefthook.yml` that pulls them; `hookset check` fails a
repository whose hooks miss a station, pin no version, repeat a preset step or drift from the pack.

It covers the install half of **husky**: where husky keeps a hook script in each repository,
hookset keeps one pinned set for all of them and checks each repository against it. Every command
prints burgee's `--json` envelope, each problem with its `fix:` line, for a pipe or an agent.

## Install

```bash
npm install hookset
pnpm add hookset
yarn add hookset
bun add hookset
```

Install it as a dev dependency (`-D`) beside lefthook. It needs git.

## Quick start

```bash
npm install hookset
```

```js
import { parseRemotes } from "hookset";

// The remote `hookset init` writes into lefthook.yml, pinned to a release tag.
const lefthook = `remotes:
  - git_url: https://github.com/ofri-peretz/burgee
    ref: hookset@0.2.1
    configs:
      - packages/hookset/presets/lefthook/pre-push.yml
`;
for (const remote of parseRemotes(lefthook)) console.log(`${remote.ref ?? "no ref"}: ${remote.configs.join(", ")}`);
```

```text
hookset@0.2.1: packages/hookset/presets/lefthook/pre-push.yml
```

`hookset check` reads the same remotes and fails when one is pinned to a branch rather than a tag.

## What it checks

```sh
hookset init            # the smallest lefthook.yml that pulls the presets, pinned to this version
hookset init --claude   # and the Claude Code hook pack under .claude/hooks/
hookset check           # the CI gate: exit 1 on any error, warnings listed
hookset check --json    # the problems as data, one fix line each
```

| Command | Exit 1 when |
| :-- | :-- |
| `init` | a `lefthook.yml` written by hand is already there and `--force` is not given |
| `check` | a station is missing, a remote pins no `hookset@<version>` tag, a preset step is repeated, or a vendored hook drifts from the pack |

## Migrating

The switch is one command, `npx hookset init`, and husky's folder comes out:

```diff
  // package.json
  "scripts": {
-   "prepare": "husky",
+   "prepare": "lefthook install",
  }
```

`npx hookset init` writes `lefthook.yml`; move each `.husky/<hook>` script into the
`hook:staged` or `hook:verify` script its station calls, then delete `.husky/`.

## Compatibility

Not graded: hookset reads and writes a repository's hook configuration, and no suite is graded
against it. It runs anywhere git and lefthook do.

## Benchmarks

Every number here is produced by `npm run bench` and published at [burgee.interlace.tools/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks).

No suite is graded against this package yet, so there is no compatibility number to quote.

## For agents

- **`hookset check --json`** and **`init --json`** print burgee's `--json` envelope, every
  problem with a message that ends in `fix:`.
- **`--json`, `--schema` and an MCP server** come from one declaration on burgee:
  `hookset --mcp` serves its commands as tools.
- **The Claude Code hook pack** is what an agent meets first: a denied `--no-verify` names the
  hook to fix instead.
- **The docs are machine-readable** at
  [burgee.interlace.tools/llms.txt](https://burgee.interlace.tools/llms.txt).

## API

| Import | What it gives you |
| :-- | :-- |
| `hookset` | `parseRemotes()`, `checkRepo()`, `checkText()`, `initRepo()`, `lefthookTemplate()`, `loadStations()` and `program` |

The `hookset` bin is that API, declared once on burgee.

## Requirements

Node 22.13 or later, git and lefthook.

## Where it sits

It hosts no plugin key of its own.

Nothing in this family builds on it yet, and it builds on `burgee`.

## The family

18 packages, one repository, one release pipeline. Each installs and works on its own, and each owns
one job. Seven of them — `bellpull`, `closeout`, `linegauge`, `paratext`, `roundel`, `seniority`,
`truefit` — depend on nothing; the others depend only on packages in this table, and every
dependency points one way, down the [layers](https://burgee.interlace.tools/docs/concepts/family).

No package declares a dependency from outside the family; `react` and `react-reconciler` are
optional peers of `controlroom`, which npm does not install; `vitest` is an optional peer of
`oxmutate`, which npm does not install; `eslint` is an optional peer of `truepass`, which npm does
not install.
[`package-shape-lock`](https://github.com/ofri-peretz/burgee/blob/main/scripts/package-shape-lock.test.ts)
holds that for every manifest, and
[`independence-install-lock`](https://github.com/ofri-peretz/burgee/blob/main/scripts/independence-install-lock.test.ts)
installs each package alone and finds nothing but the family packages it declares.

Releases are published by one workflow through npm trusted publishing: no npm token is used, and
each release carries SLSA provenance, which `npm view <package> dist.attestations` shows.
[`trusted-publishing-lock`](https://github.com/ofri-peretz/burgee/blob/main/scripts/trusted-publishing-lock.test.ts)
keeps both true.

| Package | What it is | Migrates from |
| :-- | :-- | :-- |
| [burgee](https://burgee.interlace.tools/docs/packages/burgee) | The CLI framework: one declaration, every surface | commander, yargs and meow |
| [roundel](https://roundel.interlace.tools/docs) | Colour: one output policy, semantic tokens, a theme | chalk, colorette, kleur, picocolors, supports-color and yoctocolors |
| [flagstaff](https://flagstaff.interlace.tools/docs) | The frame loop: spinners, progress, boxes and tables | ora, log-update, boxen and cli-table3 |
| [caique](https://caique.interlace.tools/docs) | Prompts that are flags first, and never hang | @inquirer/core |
| [linegauge](https://linegauge.interlace.tools/docs) | Measuring, wrapping, truncating and slicing styled text | string-width, wrap-ansi, strip-ansi, slice-ansi, cli-truncate and widest-line |
| [paratext](https://paratext.interlace.tools/docs) | Hyperlinks, images, title, clipboard and notifications | ansi-escapes, terminal-link and term-img |
| [seniority](https://seniority.interlace.tools/docs) | Configuration precedence and discovery, with provenance | cosmiconfig, lilconfig, dotenv and rc |
| [closeout](https://closeout.interlace.tools/docs) | Exit handlers, terminal restore and a bounded shutdown | signal-exit, exit-hook, restore-cursor, cli-cursor and onetime |
| [bellpull](https://bellpull.interlace.tools/docs) | Subprocesses, and which executable actually ran | cross-spawn and which |
| [controlroom](https://controlroom.interlace.tools/docs) | Keyboard-driven terminal screens, inline or full-screen | ink |
| [oxmutate](https://oxmutate.interlace.tools/docs) | Mutation testing on the oxc engine, inside your own Vitest | Stryker |
| [truepass](https://burgee.interlace.tools/docs/packages/truepass) | Lint rules and a pre-push check that keep a test suite honest | @vitest/eslint-plugin |
| [contractdiff](https://burgee.interlace.tools/docs/packages/contractdiff) | API contracts: breaking-change diff, lint, and code from the spec | openapi-typescript |
| [truefit](https://burgee.interlace.tools/docs/packages/truefit) | Validation whose schemas are data, with no eval | zod |
| [provedone](https://burgee.interlace.tools/docs/packages/provedone) | A receipt for how every change was verified, and a gate that reads it | @commitlint/cli |
| [replz](https://burgee.interlace.tools/docs/packages/replz) | Recall of a reviewer and its checks, replayed on bugs that shipped | promptfoo |
| **hookset** (this package) | The same git and Claude Code hooks in every repository, pinned by tag | husky |
| [triggerlist](https://burgee.interlace.tools/docs/packages/triggerlist) | The review checklist a diff selects, read from the base branch | danger |

Every migration guide, and the family-wide [compatibility](https://burgee.interlace.tools/docs/compatibility)
and [benchmarks](https://burgee.interlace.tools/docs/benchmarks) pages, are on
[burgee.interlace.tools](https://burgee.interlace.tools/docs/packages).

## Contributing

Issues and pull requests are welcome at [ofri-peretz/burgee](https://github.com/ofri-peretz/burgee/issues); read
[CONTRIBUTING.md](https://github.com/ofri-peretz/burgee/blob/main/CONTRIBUTING.md) first. Report a vulnerability privately, as
[SECURITY.md](https://github.com/ofri-peretz/burgee/blob/main/SECURITY.md) describes — never in a public issue.

## Licence

MIT © Ofri Peretz — see [LICENSE](https://github.com/ofri-peretz/burgee/blob/main/packages/hookset/LICENSE).
