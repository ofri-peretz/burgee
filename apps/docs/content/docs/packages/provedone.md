---
title: provedone
description: "Verified commits for JS and TS repos: each commit carries a receipt of the command that proved it, each intent a done check, and a gate reads both. No dependency outside the burgee family. A @commitlint/cli migration path."
---

**provedone** puts a receipt on every change: the command that proved it, how it exited, and a
digest of what it printed, as git trailers beside `Co-Authored-By:`. `provedone stamp` runs the
command and writes the lines; `provedone gate` reads a commit message or a PR body and, in
`enforce` mode, blocks one with no receipt; `provedone done` asks whether every success criterion
of an intent has a passing stamp on the branch. Every finding names its fix, as the same record
for a person, for `--json` and for a coding agent.

It covers the trailer half of **@commitlint/cli**: where a `trailer-exists` rule asks that a
`Verified-by:` line be present, provedone also writes it from a run that happened and checks it
gives a reason when it says `none`. Keep commitlint for the message's shape, and put
`npx provedone gate` in the `commit-msg` hook, as
[Migrating](https://github.com/ofri-peretz/burgee/tree/main/packages/provedone#migrating) shows.

## Install

```bash
npm install provedone
pnpm add provedone
yarn add provedone
bun add provedone
```

Install it as a dev dependency (`-D`) of the repository whose commits it reads. It needs only git.

## Quick start

```bash
npm install provedone
```

```js
import { digest, trailers, verdict } from "provedone";

// What `provedone stamp --run "npm test" --not-checked "the docs site"` records.
const receipt = {
  checks: [{ command: "npm test", exit: 0, digest: digest("Tests  81 passed (81)\n") }],
  captures: [],
  notChecked: ["the docs site"],
};
console.log(trailers(receipt).join("\n"));

// And what the gate says of a message with no receipt.
const v = verdict("fix: make CI green");
console.log(`${v.reason}. fix: ${v.fix}`);
```

```text
Verified-by: npm test -> exit 0 (sha256:a5fa1eae52b6)
Not-checked: the docs site
no Verified-by: line. fix: run `provedone stamp --run "<the command that proves it>" --not-checked "<what you did not check>"` and paste its lines, or add `Verified-by: none (<why it needs no check>)`
```

That is the check `npx provedone gate .git/COMMIT_EDITMSG` runs in a `commit-msg` hook: `observe`
mode passes and logs what `enforce` would block.

## What it checks

```sh
provedone stamp --run "npm test" --not-checked "the docs site"   # trailers for the commit
provedone stamp --run "npm test" --not-checked nothing --pr      # the PR's "How this was checked" block
provedone stamp --none "comment-only change"                     # Verified-by: none, with its reason
provedone gate .git/COMMIT_EDITMSG                               # observe: passes, logs what enforce would block
provedone gate pr-body.md --mode enforce                         # blocks a body with no receipt
provedone done faster-help                                       # every success criterion has a passing stamp?
provedone intent new faster-help                                 # intent.md and spec.md from _template/
provedone intent check --evidence                                # the intent rules, and the shipped evidence re-run
```

| Command | Exit 1 when |
| :-- | :-- |
| `stamp` | a `--run` command failed (it is still recorded) |
| `gate` | `enforce`, no `Verified-by:` line or a `none` with no reason, and fewer than two blocks this session |
| `done` | a success criterion has no passing stamp on this branch; each gets a `fix:` naming the stamp to run |
| `intent check` | an intent breaks a rule, the index disagrees, or a re-run evidence command no longer matches |

```text
Verified-by: npm test -> exit 0 (sha256:85f7e552faae)
Captured: shots/home.png
Not-checked: the docs site
```

One `Verified-by:` per command, with its exit code and the first 12 hex of the output's sha256;
`Verified-by: none (<reason>)` for a change that needs no check. They are git trailers, so
`git log --format='%(trailers:key=Verified-by)'` answers which commits were never verified. Git
reads trailers from the message's last paragraph only, so paste them beside `Co-Authored-By:`,
with no blank line between.

Stamps and the gate log are JSON lines under `.git/provedone/`, never in the tree. `done` reads
the stamps of the current branch. The gate's session is `PROVEDONE_SESSION`, else the agent's
session id (`CLAUDE_CODE_SESSION_ID`, `CLAUDE_SESSION_ID`), else the branch; after two blocks in
one session the gate lets the next commit through and logs it, so an agent is never stuck.

## Migrating

The switch is one command, `npx provedone gate` in the `commit-msg` hook, next to commitlint:

```diff
  # lefthook.yml
  commit-msg:
    commands:
      commitlint:
        run: npx commitlint --edit {1}
+     provedone:
+       run: npx provedone gate {1}
```

and the `trailer-exists` rule for `Verified-by:` comes out of `commitlint.config.js`. Start in
`observe` mode, which passes and logs; add `--mode enforce` once the log shows only real misses.

## Compatibility

Not graded: provedone reads commit messages, PR bodies and intents, and no suite is graded
against it. It runs anywhere git does.

## Benchmarks

Every number here is produced by `npm run bench` and published at [burgee.interlace.tools/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks).

No suite is graded against this package yet, so there is no compatibility number to quote.

## For agents

- **`provedone stamp --json`**, **`gate --json`** and **`done --json`** print burgee's `--json`
  envelope, every finding with a message that ends in `fix:`.
- **`--json`, `--schema` and an MCP server** come from one declaration on burgee:
  `provedone --mcp` serves its commands as tools.
- **Exit codes are the contract.** `0` passed; `1` a check failed, as the table above says; `2` a
  usage error, with the `fix:` to run.
- **The docs are machine-readable** at
  [burgee.interlace.tools/llms.txt](https://burgee.interlace.tools/llms.txt).

## API

| Import | What it gives you |
| :-- | :-- |
| `provedone` | `trailers()`, `verdict()`, `digest()`, `checkedLine()`, `prBlock()`, `decide()`, `doneReport()`, `checkIntent()` and `program` |

The `provedone` bin is that API, declared once on burgee.

## Requirements

Node 22.13 or later, and git.

## Where it sits

It hosts no plugin key of its own.

Nothing in this family builds on it yet, and it builds on `bellpull` and `burgee`.

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
| [contractdiff](https://contractdiff.interlace.tools/docs) | API contracts: breaking-change diff, lint, and code from the spec | openapi-typescript |
| [truefit](https://truefit.interlace.tools/docs) | Validation whose schemas are data, with no eval | zod |
| **provedone** (this package) | A receipt for how every change was verified, and a gate that reads it | @commitlint/cli |
| [replz](https://burgee.interlace.tools/docs/packages/replz) | Recall of a reviewer and its checks, replayed on bugs that shipped | promptfoo |
| [hookset](https://burgee.interlace.tools/docs/packages/hookset) | The same git and Claude Code hooks in every repository, pinned by tag | husky |
| [triggerlist](https://burgee.interlace.tools/docs/packages/triggerlist) | The review checklist a diff selects, read from the base branch | danger |

Every migration guide, and the family-wide [compatibility](https://burgee.interlace.tools/docs/compatibility)
and [benchmarks](https://burgee.interlace.tools/docs/benchmarks) pages, are on
[burgee.interlace.tools](https://burgee.interlace.tools/docs/packages).

## Contributing

Issues and pull requests are welcome at [ofri-peretz/burgee](https://github.com/ofri-peretz/burgee/issues); read
[CONTRIBUTING.md](https://github.com/ofri-peretz/burgee/blob/main/CONTRIBUTING.md) first. Report a vulnerability privately, as
[SECURITY.md](https://github.com/ofri-peretz/burgee/blob/main/SECURITY.md) describes — never in a public issue.

## Licence

MIT © Ofri Peretz — see [LICENSE](https://github.com/ofri-peretz/burgee/blob/main/packages/provedone/LICENSE).
