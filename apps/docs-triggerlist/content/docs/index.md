---
title: triggerlist
description: "Code review checklist that the diff selects: only items whose triggers fire reach the reviewer, REVIEW.md compiles under a byte budget, and rules are read from the base branch. No dependency outside the burgee family. A danger migration path."
---

**triggerlist** gives a code reviewer, a person or a model, only the checklist items a change
fires. Each item names the paths and the line pattern that trigger it, the question to ask and
the check that answers it. `triggerlist match` lists what fires on a diff, `brief` writes the
reviewer's prompt for one round, `compile` writes REVIEW.md under a byte budget, and `protect`
flags a change that edits a gate and the code it judges together. The checklist and the rules
are read from the base branch, so a pull request is reviewed by rules it did not write.

It covers the rules half of **danger**: where a Dangerfile runs code against a pull request,
triggerlist keeps the rules as data a reviewer reads. Every command prints burgee's `--json`
envelope, each item with where it fired, for a pipe or an agent.

## Install

```bash
npm install triggerlist
pnpm add triggerlist
yarn add triggerlist
bun add triggerlist
```

Install it as a dev dependency (`-D`) of the repository it reviews. It needs git.

## Quick start

```bash
npm install triggerlist
```

```js
import { match, parseChecklist, parseDiff } from "triggerlist";

const checklist = parseChecklist(".sdlc/checklist.yaml", `
gates: ["scripts/*-lock.test.ts"]
items:
  - id: spawn
    trigger: { paths: ["src/**/*.ts"], pattern: "child_process" }
    question: Does it spawn through bellpull?
    check: a direct child_process import is a finding
    sources: ["#212"]
`);
// What `git diff --no-renames -U0` prints for one added import.
const diff = `diff --git a/src/run.ts b/src/run.ts
--- a/src/run.ts
+++ b/src/run.ts
@@ -1,0 +2,1 @@
+import { spawn } from "node:child_process";
`;
for (const { item, at } of match(checklist, parseDiff(diff))) console.log(`${item.id}: ${item.question} (${at[0].file}:${at[0].line})`);
```

```text
spawn: Does it spawn through bellpull? (src/run.ts:2)
```

## What it checks

```sh
triggerlist match origin/main                          # the items that fire on origin/main...HEAD
triggerlist brief origin/main --head "$SHA"            # the reviewer's prompt for one round
triggerlist compile --check                            # fail when REVIEW.md is stale
triggerlist protect origin/main                        # a gate and the code it judges, changed together
```

| Command | Exit 1 when |
| :-- | :-- |
| `compile --check` | REVIEW.md is not what the checklist compiles to |
| `protect` | one change edits a gate file and the code that gate judges |

## Migrating

The switch is one command, `npx triggerlist brief`, where the Dangerfile ran:

```diff
  # .github/workflows/review.yml
-     - run: npx danger ci
+     - run: npx triggerlist brief origin/${{ github.base_ref }} --head ${{ github.sha }} > brief.md
```

and each Dangerfile rule becomes a checklist item with the paths that trigger it. Keep danger for
rules that must post on the pull request themselves.

## Compatibility

Not graded: triggerlist reads a repository's diff and checklist, and no suite is graded against
it. It runs anywhere git does.

## Benchmarks

Every number here is produced by `npm run bench` and published at [burgee.interlace.tools/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks).

No suite is graded against this package yet, so there is no compatibility number to quote.

## For agents

- **`triggerlist match --json`**, **`brief --json`** and **`protect --json`** print burgee's
  `--json` envelope; a failure ends in `fix:`.
- **`--json`, `--schema` and an MCP server** come from one declaration on burgee:
  `triggerlist --mcp` serves its commands as tools.
- **Exit codes are the contract.** `0` passed; `1` a check failed, as the table above says; `2` a
  usage error, with the `fix:` to run.
- **The docs are machine-readable** at
  [burgee.interlace.tools/llms.txt](https://burgee.interlace.tools/llms.txt).

## API

| Import | What it gives you |
| :-- | :-- |
| `triggerlist` | `parseChecklist()`, `parseDiff()`, `match()`, `compile()`, `protect()`, `briefText()` and `program` |

The `triggerlist` bin is that API, declared once on burgee.

## Requirements

Node 22.13 or later, and git.

## Where it sits

It hosts no plugin key of its own.

Nothing in this family builds on it yet, and it builds on `bellpull`, `burgee`, `seniority`, `truefit`.

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
| [truepass](https://truepass.interlace.tools/docs) | Lint rules and a pre-push check that keep a test suite honest | @vitest/eslint-plugin |
| [contractdiff](https://contractdiff.interlace.tools/docs) | API contracts: breaking-change diff, lint, and code from the spec | openapi-typescript |
| [truefit](https://truefit.interlace.tools/docs) | Validation whose schemas are data, with no eval | zod |
| [provedone](https://provedone.interlace.tools/docs) | A receipt for how every change was verified, and a gate that reads it | @commitlint/cli |
| [replz](https://replz.interlace.tools/docs) | Recall of a reviewer and its checks, replayed on bugs that shipped | promptfoo |
| [hookset](https://hookset.interlace.tools/docs) | The same git and Claude Code hooks in every repository, pinned by tag | husky |
| **triggerlist** (this package) | The review checklist a diff selects, read from the base branch | danger |

Every migration guide, and the family-wide [compatibility](https://burgee.interlace.tools/docs/compatibility)
and [benchmarks](https://burgee.interlace.tools/docs/benchmarks) pages, are on
[burgee.interlace.tools](https://burgee.interlace.tools/docs/packages).

## Contributing

Issues and pull requests are welcome at [ofri-peretz/burgee](https://github.com/ofri-peretz/burgee/issues); read
[CONTRIBUTING.md](https://github.com/ofri-peretz/burgee/blob/main/CONTRIBUTING.md) first. Report a vulnerability privately, as
[SECURITY.md](https://github.com/ofri-peretz/burgee/blob/main/SECURITY.md) describes — never in a public issue.

## Licence

MIT © Ofri Peretz — see [LICENSE](https://github.com/ofri-peretz/burgee/blob/main/packages/triggerlist/LICENSE).
