# Adoption targets: ten CLIs, ranked by fit

Roadmap [`marketing-and-docs.md`](../roadmap/marketing-and-docs.md) 5.2, intent
[`first-adopter`](../intents/first-adopter/spec.md). Researched 2026-09-23. **Nothing here
has been sent.** Each draft below is for the owner to read, edit and post, one at a time.

## How the ten were picked

1. **Candidates.** [`dependents.md`](./dependents.md), regenerated 2026-09-23 with
   `npm run rank:dependents -- --limit 500 --top 10000 --json` (no secrets needed; the
   2026-09-08 run was 15 days old). Its top 50 per host, plus 60-odd well-known CLIs checked
   by hand on `registry.npmjs.org` for a direct `commander` or `yargs` dependency, since the
   ranking only keeps 50 rows per host and misses smaller CLIs.
2. **Hard filters.**
   - A commit on the default branch in the last 90 days (since 2026-06-25).
   - The CLI imports its host on the default branch, and the import is one `burgee migrate`
     maps (`commander`, `yargs`, `yargs/yargs`, `yargs/helpers`).
   - The host major is within reach of what the oracle grades: commander 15.0.0 and
     yargs 18.1.0 (`packages/compat-oracle/vendor/*/package.json`), at 1360 / 1360 and
     804 / 804.
   - Not a giant where a parser swap is unrealistic, and not a library whose CLI is
     incidental.
3. **Fit.** `gh search issues` (read-only), per repository, for open issues on shell
   completions, `--json`/machine-readable output, MCP, non-TTY and CI hangs, and exit codes.
   Each hit was then read, and it counts only if what an import swap adds would actually
   touch it:
   - **A:** the swap alone closes the issue.
   - **B:** the swap plus a small change in the same PR closes it. Usually that change moves
     the run into a command handler so its result reaches the `--json` envelope.
   - **C:** no open issue asks for this. The fit is structural: an exact host version, one
     import site, and an active maintainer.

Only five maintained, non-giant dependents have an open issue that burgee's surfaces
touch (A or B). The other five are the best structural fits. **Send the C drafts only
after an A or B target has merged**, so that they can point to a real adopter instead of
asking cold.

## Two costs every target pays

- **Node ≥ 24.** Every published burgee package declares `engines: >=24` (K2, C3). Nine of the
  ten test Node 22 in CI, and three test Node 20 (`@devcontainers/cli`, `pa11y-ci`,
  `@graphql-codegen/cli`). Node 22 is in maintenance
  LTS until April 2027, so for most of them adopting burgee means dropping a supported line
  early. Every draft says so in its first half, and this cost is the most likely reason for
  a "no".
- **yargs types.** `burgee/yargs` exports no `Argv`, `Arguments` or `CommandModule` type;
  TypeScript projects get those from `@types/yargs`. A file that does
  `import yargs, { Argv } from 'yargs'` becomes a value import from `burgee/yargs` and a
  `import type` from `'yargs'`, with `@types/yargs` kept as a devDependency. `burgee migrate`
  rewrites type-only specifiers too, so on a TypeScript yargs project it currently turns a
  working type import into a broken one. This is a burgee gap to close, not a target problem.
  It hits devcontainers/cli, spectral and commitlint. **Closed after this ranking:**
  `burgee/yargs` now exports @types/yargs' surface (and `burgee/commander` commander's), so
  the diffs below no longer need the `import type` split, and `burgee migrate` checks every
  name it moves against what the façade exports.

## The ten

Weekly downloads are `api.npmjs.org/downloads/point/last-week` for 2026-09-15..21.

| # | Package | Weekly | Host (range) | Node engines | Fit | Their issue |
| --: | :-- | --: | :-- | :-- | :-: | :-- |
| 1 | `@devcontainers/cli` | 261,298 | yargs `~17.7.2` | `>=20.0.0` | A | [#1257](https://github.com/devcontainers/cli/issues/1257), [#1011](https://github.com/devcontainers/cli/issues/1011) |
| 2 | `semantic-release` | 2,188,403 | yargs `^18.0.0` | `^22.14.0 \|\| >= 24.10.0` | B | [#753](https://github.com/semantic-release/semantic-release/issues/753) |
| 3 | `@stoplight/spectral-cli` | 1,153,225 | yargs `~17.7.2` | `^22.0 \|\| >= 24.0` (main) | B | [#2912](https://github.com/stoplightio/spectral/issues/2912), [#2971](https://github.com/stoplightio/spectral/issues/2971) |
| 4 | `pa11y-ci` | 96,572 | commander `~14.0.3` | `>=20` | B | [#228](https://github.com/pa11y/pa11y-ci/issues/228), [#55](https://github.com/pa11y/pa11y-ci/issues/55) |
| 5 | `pa11y` | 187,142 | commander `~15.0.0` | `^22.13.0 \|\| >=24` | B | [#529](https://github.com/pa11y/pa11y/issues/529) |
| 6 | `dependency-cruiser` | 2,874,211 | commander `15.0.0` | `^22\|\|^24\|\|>=26` | C | none |
| 7 | `@graphql-codegen/cli` | 5,069,422 | yargs `^18.0.0` | `>=16` | C | none that the swap closes |
| 8 | `markdownlint-cli` | 822,125 | commander `~15.0.0` | `>=22` | C | none |
| 9 | `concurrently` | 15,783,555 | yargs `18.0.0` | `>=22` | C | none that the swap closes |
| 10 | `@commitlint/cli` | 7,292,246 | yargs `^18.0.0` | `>=22.12.0` | C | none |

**Alternates**, if any of 6–10 declines or goes quiet: `postcss-cli` (886,359/wk, yargs
`^18.0.0`, one import in `lib/args.js`) and `replace-in-file` (1,186,866/wk, yargs
`^18.1.0`, `bin/cli.ts`). Both are C.

### 1. devcontainers/cli

- **Repo:** <https://github.com/devcontainers/cli>. Last commit 2026-09-17.
- **Their issues:** #1257 "shell completions" (2026-06-25, asks for fish, bash and zsh)
  and #1011 "Autocompletion for devcontainer cli commands" (2025-05-28). Both are open
  and have no replies.
- **Why it fits:** `completion bash | zsh | fish | pwsh` is generated from the command tree
  on a yargs-syntax program with no code change, so this is the one A. The CLI is a
  dedicated repository with a single entry, `src/spec-node/devContainersSpecCLI.ts`, and it
  is bundled with esbuild, so `lighter-than-yargs` (0.947×, met) applies to what they ship.
- **Diff:**

  ```diff
  - import yargs, { Argv } from 'yargs';
  + import yargs from 'burgee/yargs';
  + import type { Argv } from 'yargs'; // @types/yargs stays
  ```

  Plus 13 more files with `import { Argv } from 'yargs'`, which become `import type` and
  otherwise stay as they are. Then the dependency swap in `package.json`.
- **Risk:** the highest Node gap of the ten. `engines >=20`, CI on 20.x, and
  `.github/dependabot.yml` pins majors to "Keep Node 20 compatibility". The CLI is also on
  yargs 17 while the grade is against 18.1.0. It is a Microsoft org, so expect a CLA and a
  slow review. The completions ask is the cleanest match in the whole set, and the Node
  floor is the most likely reason for a "no".

### 2. semantic-release

- **Repo:** <https://github.com/semantic-release/semantic-release>. Last commit
  2026-09-21.
- **Their issue:** #753, "Add an option to output the version that would be published".
  Open since 2018 with 94 comments. The author notes that the only current route is
  parsing dry-run output, which is "not stable".
- **Why it fits:** `--json` wraps a handler's return value in `{ "ok": true, "data": … }`
  and puts failures in the same shape. `cli.js` is the only import site.
- **Diff:**

  ```diff
  - import yargs from "yargs";
  - import { hideBin } from "yargs/helpers";
  + import yargs from "burgee/yargs";
  + import { hideBin } from "burgee/yargs/helpers";
  ```

  **Not one line.** `cli.js` declares a `$0` command with no handler, parses, and then calls
  the release run outside yargs. So the PR also moves that call into the `$0` handler and
  returns `nextRelease` from it. Only then
  does `semantic-release --dry-run --json` print it.
- **Risk:** `engines` still admits Node 22.14, and CI tests 22.14.0, 24.10.0 and 24. The project runs in a very large share of
  release pipelines, so the maintainers are conservative with the CLI. #2932 (errors that
  exit 0) is related, but those errors are lost inside the release run, which the swap does
  not reach, so the draft does not claim it.

### 3. stoplightio/spectral (`@stoplight/spectral-cli`)

- **Repo:** <https://github.com/stoplightio/spectral>. Last commit 2026-09-17.
- **Their issues:**
  - #2912: `--format json` prints `[]No results…`, because an informational line is
    appended to stdout, so the output is invalid JSON.
  - #2971: a `--summary` for CI dashboards "without parsing the full per-issue list".
  - Context, not claimed: #2150 (exit-code taxonomy).
- **Why it fits:** a `--json` envelope keeps stdout to one document, with human messages
  kept out of it. The `lint` command is already a yargs `CommandModule`, so returning its
  results from the handler is a small change.
- **Diff:**

  ```diff
  - import * as yargs from 'yargs';
  + import yargs from 'burgee/yargs';
  ```

  This is in `packages/cli/src/index.ts`. The namespace import has to become a default
  import, and `CommandModule` in `commands/lint.ts` stays an `import type` from `@types/yargs`.
- **Risk:** yargs 17 compiled to CommonJS from TypeScript, where `require(esm)` works on
  Node 24. `engines` admits Node 22, and CI pins 22.23.2. The repo has 222 open issues and
  PRs, and triage is slow.
  Their own `--format json` stays their code. The draft offers the envelope next to that
  flag, not in place of it.

### 4. pa11y-ci

- **Repo:** <https://github.com/pa11y/pa11y-ci>. Last commit 2026-09-13.
- **Their issues:** #228, "pa11y-ci uses exit code 0 when a URL 'failed to run'", and #55,
  "CLI output + save json file?".
- **Why it fits:** it is a CI tool whose whole job is an exit status and a report. Once the
  run is inside `.action()`, a thrown failure exits non-zero, and `--json` returns the
  result as data. It is small: one entry, `bin/pa11y-ci.js`, that a maintainer can review
  in an evening.
- **Diff:**

  ```diff
  - const {Command} = require('commander');
  + const {Command} = require('burgee/commander');
  ```

  This relies on `require(esm)`, which is guaranteed on Node 24 (K2). The PR also moves the
  run, which today executes after `.parse()`, into the action.
- **Risk:** `engines >=20`, and CI runs 20, 22 and 24. The maintainers are the same people as for #5, so send only one
  of 4 and 5 at a time, and start with pa11y-ci, which has the stronger issue.

### 5. pa11y

- **Repo:** <https://github.com/pa11y/pa11y>. Last commit 2026-09-21.
- **Their issue:** #529, "Parse and validate all cli arguments before launching pa11y".
  `--runner potato` ends in an `UnhandledPromiseRejectionWarning` instead of a message.
- **Why it fits:** commander `~15.0.0`, the graded version. Inside the action, a rejected
  runner becomes one message and a non-zero exit, and under `--json` it becomes a
  `{ "ok": false, … }` envelope. The validation itself is a few lines in the same PR.
- **Diff:**

  ```diff
  - const {program} = require('commander');
  + const {program} = require('burgee/commander');
  ```

- **Risk:** this is the weakest B, because commander with `parseAsync` could also be made
  to catch the error. #738 on the same tracker carries a templated comment ("Would you want
  this one done? … If yes, we'll do it and open a PR"), which reads like automated outreach.
  These maintainers are already receiving offers of that kind, so the draft has to read as
  one person with one specific change.

### 6. dependency-cruiser

- **Repo:** <https://github.com/sverweij/dependency-cruiser>. Last commit 2026-09-22.
  One maintainer, and very responsive.
- **Their issue:** none. It already has rich `--output-type` formats.
- **Why it fits:** the best structural fit in the set. It pins commander `15.0.0`, the
  exact version the oracle grades, and has one import site, `bin/dependency-cruiser.mjs`.
  What it would gain is the agent surface: `--schema`, which gives its large option set as
  JSON Schema without running a handler, plus completions.
- **Diff:**

  ```diff
  - import { program, Option } from "commander";
  + import { program, Option } from "burgee/commander";
  ```

- **Risk:** the package is `"type": "commonjs"`, but the bin is `.mjs`, so that is fine.
  CI runs Node 22 and 26. With no issue to lead with, this should be sent only after an A
  or B target has merged.

### 7. @graphql-codegen/cli

- **Repo:** <https://github.com/dotansimha/graphql-code-generator>. Last commit
  2026-09-22.
- **Their issue:** none that the swap closes. The exit-code bugs #9915 and #9272 happen
  inside the codegen runner, and `yargs` is only used to parse into options, in
  `packages/graphql-codegen-cli/src/config.ts`, so the swap does not touch them. The draft
  does not cite them.
- **Why it fits:** one import in one file, yargs `^18.0.0`, and a CLI run in CI by millions
  of installs where `--schema` and completions cost nothing.
- **Diff:**

  ```diff
  - import yargs from 'yargs';
  + import yargs from 'burgee/yargs';
  ```

- **Risk:** it declares `engines >=16`, the largest stated-floor jump in the set. CI runs
  20, 22 and 24. It is a monorepo run by The Guild, and the CLI package is separate.

### 8. markdownlint-cli

- **Repo:** <https://github.com/igorshubovych/markdownlint-cli>. Last commit 2026-09-22.
- **Their issue:** none.
- **Why it fits:** commander `~15.0.0` and one file, `markdownlint.js`. It is also the kind
  of CLI that agents run on repositories, where `--schema` saves reading `--help` prose.
- **Diff:**

  ```diff
  - import {program} from 'commander';
  + import {program} from 'burgee/commander';
  ```

- **Risk:** it tests Node 22. It is small, with one maintainer, and could say no quickly,
  which is also a useful outcome.

### 9. concurrently

- **Repo:** <https://github.com/open-cli-tools/concurrently>. Last commit 2026-09-15.
- **Their issue:** none that the swap closes. The open exit-code and signal issues
  ([#470](https://github.com/open-cli-tools/concurrently/issues/470),
  [#283](https://github.com/open-cli-tools/concurrently/issues/283)) are about how
  concurrently handles its children, which a parser swap does not change. The draft must
  not imply otherwise.
- **Why it fits:** the most-downloaded CLI in the set, on yargs `18.0.0` with one entry
  (`bin/index.ts`). From the README, yargs costs +78.5 ms over bare node on a full CLI run
  and burgee +14.0 ms, on one machine.
- **Diff:**

  ```diff
  - import yargs from 'yargs';
  - import { hideBin } from 'yargs/helpers';
  + import yargs from 'burgee/yargs';
  + import { hideBin } from 'burgee/yargs/helpers';
  ```

- **Risk:** it tests Node 22. A tool this widely used will want the speed figure reproduced
  on its own CLI, not quoted from ours. The PR should include a before and after
  measurement, or leave the number out.

### 10. @commitlint/cli

- **Repo:** <https://github.com/conventional-changelog/commitlint>. Last commit
  2026-09-21.
- **Their issue:** none.
- **Why it fits:** yargs `^18.0.0`, a single CLI file (`@commitlint/cli/src/cli.ts`), and it
  runs in every commit hook, including this repo's own `lefthook.yml`.
- **Diff:**

  ```diff
  - import yargs, { type Arguments } from "yargs";
  + import yargs from "burgee/yargs";
  + import type { Arguments } from "yargs";
  ```

- **Risk:** the yargs type gap above. It tests Node 22. Because burgee's own hooks run it,
  this is a pitch to a tool we depend on, and a "no" should be taken gracefully.

## Drafts

Each draft is at most 150 words. Each leads with the target's issue where it has one,
cites only figures on the README's *Measured* table or the compatibility page, and says
who wrote it. Post it as a new issue that links the one it cites. Do not comment on the
existing issue: a comment pings every earlier participant on it.

### 1. devcontainers/cli

Title: `Shell completions (#1257, #1011) via a one-import yargs swap — offer to PR`

```markdown
#1257 and #1011 ask for shell completions. I maintain burgee, whose `burgee/yargs` entry
implements yargs' API and is graded by yargs' own test suite in CI (804 / 804).

Swapping the import gives the existing command tree `devcontainer completion
bash|zsh|fish|pwsh`, generated from the same `.command()` declarations; pressing TAB never
runs the CLI. It also adds `--json` and `--schema`, which change nothing unless called.

Two costs, up front: burgee requires Node ≥ 24, and this repo still tests and pins for
Node 20. And `Argv` would keep coming from `@types/yargs` as an `import type`.

If that trade is acceptable I'd like to open the PR (the import change, a completions test
per shell) for you to review. If the Node floor rules it out, closing this is a fine answer.
```

### 2. semantic-release

Title: `A machine-readable next version (#753) — offer to PR`

```markdown
#753 asks for the version that would be published in a form a script can read, rather than
parsing dry-run output. I maintain burgee; `burgee/yargs` implements yargs' API and passes
yargs' own test suite in CI (804 / 804).

With `yargs` and `yargs/helpers` pointed at it, a `--json` flag prints a command's return
value as `{ "ok": true, "data": … }`, and a failure as `{ "ok": false, … }` with a non-zero
exit. The PR would also move the release call in `cli.js` into the existing `$0` command's
handler and return `nextRelease`, so `semantic-release --dry-run --json` answers #753 directly.

The cost: burgee needs Node ≥ 24, and `engines` still admits 22.14.

Would a PR along those lines be welcome, now or once 22 is dropped? Happy to wait for the
second.
```

### 3. stoplightio/spectral

Title: `One JSON document on stdout for lint results (#2912, #2971) — offer to PR`

```markdown
#2912 shows `--format json` printing `[]No results…`, and #2971 asks for output a CI
pipeline can consume without post-processing. I maintain burgee; `burgee/yargs` implements
yargs' API and passes yargs' own suite in CI (804 / 804).

After swapping the import in `packages/cli/src/index.ts`, `spectral lint --json` would
print exactly one document, `{ "ok": true, "data": … }`, with human messages kept off
stdout; a failure is the same envelope with `"ok": false` and a non-zero exit. The
existing `--format json` stays as it is. The PR would return the lint results from the
`lint` handler so the envelope carries them.

Costs: burgee requires Node ≥ 24 (you support 22), and the namespace import becomes a
default import.

Would that be welcome as a PR?
```

### 4. pa11y-ci

Title: `Non-zero exit when a URL fails to run (#228), plus JSON output (#55) — offer to PR`

```markdown
#228 reports exit code 0 when a URL "failed to run", and #55 asks for JSON output. I
maintain burgee; `burgee/commander` implements commander's API and passes commander's own
test suite in CI (1360 / 1360).

The PR would change the `require('commander')` in `bin/pa11y-ci.js` to
`require('burgee/commander')` and move the run into `.action()`. From there a failed URL
rejects and exits non-zero, and `pa11y-ci --json` prints the results as
`{ "ok": true, "data": … }` (or `"ok": false` on failure) without touching the existing
reporters.

The cost: burgee requires Node ≥ 24, and `engines` says `>=20`.

If that is acceptable I'd like to open the PR, with a test for the #228 case. Closing this
is a fine answer too.
```

### 5. pa11y

Title: `A clear error for an unknown --runner (#529) — offer to PR`

```markdown
#529 shows `--runner potato` ending in an `UnhandledPromiseRejectionWarning` rather than a
message. I maintain burgee; `burgee/commander` implements commander's API and passes
commander's own test suite in CI (1360 / 1360), and you are already on commander 15.

The PR would swap the `require` in `bin/pa11y.js`, check the runner inside the action, and
let the failure surface as one line and a non-zero exit, or, under `--json`, as
`{ "ok": false, … }`. It adds `--schema` and `completion <shell>` as a side effect; neither
changes default output.

The cost: burgee requires Node ≥ 24, and `engines` admits 22.13.

Would that be useful as a PR? It is one person's offer, not an automated one.
```

### 6. dependency-cruiser

Title: `Question: interest in --schema / completions via a one-import commander swap?`

```markdown
No open issue asks for this, so please close it if it is noise.

I maintain burgee. `burgee/commander` implements commander's API and is graded by
commander's own test suite in CI, pinned to 15.0.0, the version you pin (1360 / 1360).

Changing the one import in `bin/dependency-cruiser.mjs` would add `depcruise --schema`,
which prints every option as JSON Schema without running anything, useful to agents that
drive the CLI, and `completion bash|zsh|fish|pwsh`. Default output is unchanged. Commands
you mark `.effects('read_only')` could also be served over MCP; nothing is exposed unless
marked.

The cost: burgee requires Node ≥ 24, and you test 22.

If you'd want it, I'll open the PR; if not, no follow-up from me.
```

### 7. @graphql-codegen/cli

Title: `Question: --schema and completions for graphql-codegen via a one-import yargs swap?`

```markdown
No open issue asks for this, so close it freely.

I maintain burgee; `burgee/yargs` implements yargs' API and passes yargs' own suite in CI
(804 / 804). `packages/graphql-codegen-cli/src/config.ts` is the only yargs import.

Changing it would add `graphql-codegen --schema` (every option as JSON Schema, no handler
runs), which helps agents that call codegen in CI, and `completion bash|zsh|fish|pwsh`.
Parsing and default output are unchanged.

The cost is real: burgee requires Node ≥ 24, and `engines` still says `>=16`.

If a Node 24 floor is on your roadmap anyway, I'd be glad to open the PR then.
```

### 8. markdownlint-cli

Title: `Question: --schema and completions via a one-import commander swap?`

```markdown
No open issue asks for this; close it if it is not useful.

I maintain burgee; `burgee/commander` implements commander's API and passes commander's
own test suite in CI (1360 / 1360), graded against 15.0.0, which you're on.

Changing the import in `markdownlint.js` would add `markdownlint --schema` (the options as
JSON Schema, nothing runs) for agents that lint repositories, and
`completion bash|zsh|fish|pwsh`. Default output and exit codes are unchanged.

The cost: burgee requires Node ≥ 24, and you test 22.

Happy to open the PR if you'd want it; otherwise no follow-up from me.
```

### 9. concurrently

Title: `Question: --schema and completions via a one-import yargs swap?`

```markdown
No open issue asks for this, and it would not change child-process or signal handling
(#470 and #283 stay as they are), so close it if it is not useful.

I maintain burgee; `burgee/yargs` implements yargs' API and passes yargs' own suite in CI
(804 / 804). `bin/index.ts` is the only yargs import, plus `yargs/helpers`.

The swap adds `concurrently --schema` (every option as JSON Schema) and
`completion bash|zsh|fish|pwsh`; default behaviour is unchanged. Our README measures a full
CLI run at +78.5 ms over bare node for yargs and +14.0 ms for burgee, on one machine; the PR
would include your own before and after rather than ask you to trust ours.

The cost: burgee requires Node ≥ 24, and you test 22.

Would a PR be welcome?
```

### 10. @commitlint/cli

Title: `Question: --schema and completions via a one-import yargs swap?`

```markdown
No open issue asks for this; please close it if it is noise. (We run commitlint in our
own hooks, which is how it came up.)

I maintain burgee; `burgee/yargs` implements yargs' API and passes yargs' own suite in CI
(804 / 804). `@commitlint/cli/src/cli.ts` is the only yargs import in the CLI.

Swapping it adds `commitlint --schema` (every option as JSON Schema, nothing runs) and
`completion bash|zsh|fish|pwsh`. Default output and exit codes are unchanged. The
`Arguments` type would stay an `import type` from `@types/yargs`.

The cost: burgee requires Node ≥ 24, and you test 22.

If that fits your plans, I'd like to open the PR.
```

## Excluded, and why

| Package(s) | Reason |
| :-- | :-- |
| `openclaw` (commander 15.0.0, `engines >=24.16`) | The best technical fit in the ranking, and it is out. It has 8,290 open issues and PRs and its own `--json` conventions, and a framework swap in a project moving that fast is not reviewable. #127478 (`secrets reload --json` emits no JSON on a rejection) is exactly the failure-envelope case. Revisit once there is an adopter to cite. |
| `shadcn` | A 124k-star monorepo with 1,836 open issues and PRs that ships its own `shadcn mcp`. Its `--json` issues (#11271) are bugs in its own output. |
| `@hey-api/openapi-ts` | Leaving the host. The default branch already replaced commander with `citty` through `@hey-api/codegen-cli`, and only the published 0.99.0 still depends on it. Its #4359 "MCP server support" is about *generating* MCP servers, not about its CLI. |
| `orval` | Imports `@commander-js/extra-typings`, which `burgee migrate` does not map and the oracle does not grade. |
| `webpack-cli`, `@nestjs/cli` | They pass a `Command` through many modules (webpack-cli builds its options from webpack's schema, and Nest threads a `Command` through `commands/`, `actions/` and `lib/`), so a swap is more than one import. No issue hooks. Worth doing after a first adopter. |
| `react-native`, `expo`, `nx`, `lerna`, `@angular/cli`, `jest-cli`, `metro`, `@babel/cli`, `cypress`, `firebase-tools`, `typeorm`, `knex`, `lighthouse`, `@puppeteer/browsers`, `@wdio/cli` | Giant monorepos with their own CLI conventions, where the parser is a thin layer under years of wrappers. |
| `terser`, `svgo`, `pm2`, `@docusaurus/core`, `madge`, `nyc`, `qrcode`, `@capacitor/cli`, `netlify-cli`, `@vscode/vsce` | The host major is three or more below the graded 15.0.0 / 18.1.0 (commander 2–12, yargs 15). Behaviour changed across those majors, so "one import" is not honest. |
| `sucrase`, `katex`, `d3-dsv`, `topojson-client`, `xss`, `nunjucks`, `mssql`, `@grpc/proto-loader`, `msw` | Libraries whose CLI is incidental (`msw init` is one command). |
| `c8` | Maintained by a yargs maintainer, so asking them to replace yargs is a conflict. |
| `@stryker-mutator/core` | Its open non-TTY issue (#5929) is in a reporter, not the parser. There is no hook. |
| `editorconfig`, `find-process`, `sequelize-cli`, `@lhci/cli`, `ava`, `depcheck` | No commit in 90 days, or archived (`depcheck`). |

No burgee-family repository appears in either ranking.

## Notes for the owner

- **The spec and the roadmap disagree on the approach.** `first-adopter/spec.md` says to
  open "a working pull request that cites their own issue, not an issue asking permission".
  Roadmap 5.2, written later, says to open issues offering a PR and "never unsolicited
  PRs". These drafts follow the roadmap. The spec's Design section should be updated to
  match, or the roadmap should be.
- **One at a time.** Send #1 or #4 first. Four and five share maintainers. Hold 6–10 until
  something has merged.
- **Before sending #1, #3 or #10**, the yargs type gap should be closed in burgee, or the
  PR should carry the `import type` split by hand. Otherwise `burgee migrate --dry-run` on
  their tree will not produce a compiling result.
- **Re-check before sending.** Each issue was open on 2026-09-23. Re-read it on the day,
  because a closed issue makes the draft wrong.
