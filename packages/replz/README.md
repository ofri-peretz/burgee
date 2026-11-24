<p align="center">
  <a href="https://github.com/ofri-peretz/burgee/tree/main/packages/replz" target="blank">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/replz-lockup.svg" />
      <img src="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/replz-lockup-light.svg" alt="replz" width="360" />
    </picture>
  </a>
</p>

<p align="center">
  Play the bug back: replay the bugs that shipped, and grade the reviewer and the checks on them.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/replz"><img src="https://img.shields.io/npm/v/replz?style=flat-square&color=0a6b47" alt="replz on npm: the latest version" /></a>
  <a href="https://www.npmjs.com/package/replz"><img src="https://img.shields.io/npm/dm/replz?style=flat-square" alt="replz downloads per month on npm" /></a>
  <a href="https://github.com/ofri-peretz/burgee/actions/workflows/quality.yml?query=branch%3Amain"><img src="https://img.shields.io/github/actions/workflow/status/ofri-peretz/burgee/quality.yml?branch=main&style=flat-square&label=Quality%20Gate" alt="Quality Gate: the CI status of main" /></a>
  <a href="https://app.codecov.io/gh/ofri-peretz/burgee/components"><img src="https://img.shields.io/codecov/c/github/ofri-peretz/burgee/main?component=replz&style=flat-square" alt="replz line coverage: its Codecov component" /></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/ofri-peretz/burgee"><img src="https://img.shields.io/ossf-scorecard/github.com/ofri-peretz/burgee?style=flat-square&label=OpenSSF%20Scorecard" alt="OpenSSF Scorecard for the repository" /></a>
  <a href="https://www.npmjs.com/package/replz?activeTab=code"><img src="https://img.shields.io/npm/unpacked-size/replz?style=flat-square" alt="Unpacked size of the latest replz release on npm" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/replz/package.json"><img src="https://img.shields.io/badge/dependencies-4%20in%20family%2C%200%20outside-0a6b47?style=flat-square" alt="Four dependencies, all in the burgee family (bellpull, burgee, seniority, truefit), none outside it" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/replz/package.json"><img src="https://img.shields.io/badge/types-included-blue?style=flat-square" alt="TypeScript types included for every entry point" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/replz/package.json"><img src="https://img.shields.io/badge/Node.js-22.13%2B-green?style=flat-square" alt="Node.js 22.13+" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/replz/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License: MIT" /></a>
  <a href="https://www.npmjs.com/package/replz#provenance"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fregistry.npmjs.org%2Freplz%2Flatest&query=%24.dist.attestations.provenance~&label=npm&style=flat-square&color=0a6b47" alt="npm provenance of the latest release, read live from its registry attestation" /></a>
</p>

<p align="center">
  Docs: <a href="https://burgee.interlace.tools/docs/packages/replz">https://burgee.interlace.tools/docs/packages/replz</a><br />
  Migrating from: <a href="https://github.com/ofri-peretz/burgee/tree/main/packages/replz#migrating">promptfoo</a>
</p>

**replz** grades a code reviewer, and a repository's own checks, against bugs that actually
shipped. Each case is a merged pull request a later revert or fix blamed, with a one-sentence
answer key; size-matched clean pull requests are its controls. `replz run` checks each case out
at its head, the commit the reviewer saw (its base with the pull request applied), runs the
reviewer and the checks there, and grades every finding against the answer key, the last stage's
findings first: only a finding that describes that bug counts. The report gives recall
per stage, severity, false alarms on the controls, and how often every check fired and was right.

It covers the review half of **promptfoo**: where a promptfoo suite asserts on a model's answer
to prompts someone wrote, replz replays pull requests that really shipped a bug and asserts on
what the reviewer said about them. `replz propose` prints draft cases from the history, and every
command prints burgee's `--json` envelope, each error with its `fix:`, for a pipe or an agent.

## Install

```bash
npm install replz
pnpm add replz
yarn add replz
bun add replz
```

Install it as a dev dependency (`-D`) of the repository whose history it replays. It needs git,
and `run` needs the reviewer and grader commands its config names.

## Quick start

```bash
npm install replz
```

```js
import { parseLog, propose } from "replz";

// What `git log --first-parent --shortstat` prints for three merged pull requests and a revert.
const record = (sha, parent, subject, lines) => `\0${sha}\t${parent}\t${subject}\t\u0001\n 1 file changed, ${lines} insertions(+)\n`;
const log = [
  record("d4".repeat(20), "c3".repeat(20), 'Revert "feat: cache the config (#12)"', 40),
  record("c3".repeat(20), "b2".repeat(20), "docs: a usage page (#13)", 35),
  record("b2".repeat(20), "a1".repeat(20), "feat: cache the config (#12)", 40),
  record("a1".repeat(20), "90".repeat(20), "feat: a --quiet flag (#11)", 300),
].join("");

const { bugs, controls } = propose(parseLog(log), 10);
console.log(bugs.map((c) => `${c.id} at ${c.base}`).join("\n"));
console.log(controls.map((c) => `${c.id} (size-matched)`).join("\n"));
```

```text
bug-12 at a1a1a1a1a1a1
control-13 (size-matched)
```

That is what `replz propose` prints: each draft under the file name it belongs at in
`.sdlc/replz/cases/`, each bug with an `answer:` line for a person to fill in. It writes no file;
save the drafts you keep, and `replz check` refuses one whose answer is still the draft's `TODO`.

## What it checks

```sh
replz propose --limit 10                       # prints ten bug drafts and ten size-matched controls
replz check                                    # the config and every case, and each set's count
replz run --set test                           # the score on the held-out cases
replz run --set tune --max-findings 5 --record # a cheaper run, appended to the history
```

| Command | Exit 1 when |
| :-- | :-- |
| `check` | the config or a case file is invalid, a case file is not named `<id>.yaml`, an answer is still the draft's `TODO`, or a set lacks a bug or a control, each with the `fix:` that repairs it |
| `run` | a case could not be replayed |

`run` calls a model once per case and once per graded finding, so it is never a per-pull-request
step: run it by hand or on a schedule. `check` and `propose` cost nothing.

Every command in the config runs in the case's worktree with `REPLZ_BASE`, `REPLZ_HEAD`,
`REPLZ_PR` and `REPLZ_REPO` set. `REPLZ_REPO` is the repository `replz run` started in, as an
absolute path: name a reviewer script kept there as `bash "$REPLZ_REPO/review.sh"`, because a
relative path is read in the worktree, at a head that may predate the script.

## Migrating

The switch is one command, `npx replz run`, where the review suite ran:

```diff
  // package.json
  "scripts": {
-   "eval:review": "promptfoo eval -c review.promptfooconfig.yaml",
+   "eval:review": "npx replz run --set test",
  }
```

and the hand-written review prompts come out, replaced by case files saved from the drafts
`npx replz propose` prints from the history. Keep promptfoo for prompts that are not reviews of a pull request.

## Compatibility

Not graded: replz replays a repository's own history, and no suite is graded against it. It runs
anywhere git does.

## Benchmarks

Every number here is produced by `npm run bench` and published at [burgee.interlace.tools/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks).

No suite is graded against this package yet, so there is no compatibility number to quote.

## For agents

- **`replz check --json`**, **`run --json`** and **`propose --json`** print burgee's `--json`
  envelope; a failure carries its remedy as `error.fix`, and prose prints it on a `fix:` line.
- **`--json`, `--schema` and an MCP server** come from one declaration on burgee:
  `replz --mcp` serves its commands as tools.
- **Exit codes are the contract.** `0` passed; `1` a check failed, as the table above says, with
  its `fix:`; `2` a usage error, with the command's usage.
- **The docs are machine-readable** at
  [burgee.interlace.tools/llms.txt](https://burgee.interlace.tools/llms.txt).

## API

| Import | What it gives you |
| :-- | :-- |
| `replz` | `parseLog()`, `propose()`, `parseCase()`, `selectCases()`, `parseConfig()`, `replayCase()`, `score()` and `program` |

The `replz` bin is that API, declared once on burgee.

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
| [truepass](https://burgee.interlace.tools/docs/packages/truepass) | Lint rules and a pre-push check that keep a test suite honest | @vitest/eslint-plugin |
| [contractdiff](https://burgee.interlace.tools/docs/packages/contractdiff) | API contracts: breaking-change diff, lint, and code from the spec | openapi-typescript |
| [truefit](https://truefit.interlace.tools/docs) | Validation whose schemas are data, with no eval | zod |
| [provedone](https://burgee.interlace.tools/docs/packages/provedone) | A receipt for how every change was verified, and a gate that reads it | @commitlint/cli |
| **replz** (this package) | Recall of a reviewer and its checks, replayed on bugs that shipped | promptfoo |
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

MIT © Ofri Peretz — see [LICENSE](https://github.com/ofri-peretz/burgee/blob/main/packages/replz/LICENSE).
