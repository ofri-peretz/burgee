# Adoption target: `emmercm/igir`, the second first-adopter candidate

Intent [`first-adopter`](../../intents/first-adopter/spec.md), build step 1 (choose and record a
target) and step 2 (A3, revert first), for a second target that runs **beside**
open-cli-tools/concurrently#639, not instead of it. Chosen 2026-10-28 by
[D-20261028-first-adopter-second-target](../../decisions/D-20261028-first-adopter-second-target.md).
The ready-to-post texts are in [`upstream-igir/`](../../intents/first-adopter/upstream-igir/).

**Nothing was posted.** No comment, issue, pull request, fork or star was made outside
`ofri-peretz/*`. Every read of GitHub was a read-only `gh` call. The proof ran in two local
clones in a scratch directory; neither was pushed anywhere.

**State 2026-10-28: the right target, and not ready.** igir's maintainer has an open, self-written
ask to replace yargs, and besides concurrently#418 it is the only such ask found among
maintained CLIs on yargs or commander. But `burgee@1.9.2` fails three checks on it, and one of them is the very defect the
ask is about: igir's own compile step builds a single binary that throws on every invocation.
Each failure is a burgee gap, recorded below. The comment is held until they are fixed and the
proof is re-run on the published fix.

## The shortlist

Candidates: the four C targets left in [`adoption-targets.md`](../adoption-targets.md) (the fifth,
concurrently, is already #639), plus `gh search issues` for open issues asking to replace, remove,
drop, switch from or migrate from yargs or commander. Ranked by the outreach rules: an open ask
from a maintainer (issue-first), outside contributors merged in the last 60 days, no CLA or
corporate gate, not shrinking dependencies in a way burgee worsens, and on yargs or commander.

| # | Repository | Host | Open ask from a maintainer | Outside merges, 60 days | Gates | Why this rank |
| --: | :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | [emmercm/igir](https://github.com/emmercm/igir) | yargs `18.2.0`, the graded version | **Yes**: [#2249](https://github.com/emmercm/igir/issues/2249), by the owner, open, self-assigned | 5 (terafin); 33 merged from 17 outside authors all-time | No CLA, no AI reviewer; Snyk status, Codecov, Renovate `minimumReleaseAge: 7 days` | The only maintainer ask found. Against it: the repository is replacing dependencies with native code, and he named commander's zero dependencies as the bar |
| 2 | [dotansimha/graphql-code-generator](https://github.com/dotansimha/graphql-code-generator) (`@graphql-codegen/cli`) | yargs `^18.0.0`, one import | No | 3 (santialbo, cpruijsen, BuddhaBing) | No CLA, no AI reviewer; changeset-bot | Active outside merges and one import site, but no ask, so it is C: a cold pitch |
| 3 | [sverweij/dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | commander `15.0.0`, the graded version | No | 4 | None found | Responsive sole maintainer; but on commander `burgee/commander` turns 1 package into 6, against rule 2, and there is no ask |
| 4 | [conventional-changelog/commitlint](https://github.com/conventional-changelog/commitlint) | yargs `^18.0.0` | No | 0 (Renovate and one maintainer) | None found | No outside merges in the window, no ask, and burgee's own hooks run it |
| 5 | [igorshubovych/markdownlint-cli](https://github.com/igorshubovych/markdownlint-cli) | commander `~15.0.0` | No | 0 (only Dependabot merged) | None found | No human merges in 60 days, commander, no ask |

**Search hits that were not candidates.** Every other open ask to leave yargs or commander wants
something burgee is not: `node:util.parseArgs`, zero dependencies
([nodejs/postject#56](https://github.com/nodejs/postject/issues/56),
[tropy/tropy#860](https://github.com/tropy/tropy/issues/860),
[Accenture/sfmc-devtools#2529](https://github.com/Accenture/sfmc-devtools/issues/2529),
[edrlab/thorium-reader#3720](https://github.com/edrlab/thorium-reader/issues/3720),
[e18e/ecosystem-issues#174](https://github.com/e18e/ecosystem-issues/issues/174)), or a
dependency purge ([wxt-dev/wxt#2523](https://github.com/wxt-dev/wxt/issues/2523)). hey-api already
left commander (excluded in `adoption-targets.md`). modelcontextprotocol/servers#5206 removes an
unused yargs.

### Bot recon on the top two

From [outreach-bot-recon]: each class, and the file or check run that shows it.

| Class | emmercm/igir | dotansimha/graphql-code-generator |
| :-- | :-- | :-- |
| CLA / ECA | None: no workflow, bot or status; #2579's statuses are `security/snyk (emmercm)` only | None: #11060 has no statuses |
| Stale / auto-close | `gh-stale-issues.yml`: issues labelled `question` only, 14 + 14 days; `days-before-pr-stale: -1`, so PRs never go stale. `gh-lock-issues.yml` locks closed issues | None |
| First-time CI approval | Expected: CONTRIBUTING says "Running tests in GitHub may require maintainer approval" | Unknown; outside PRs show only `github-actions` checks |
| AI code reviewers | None: no `copilot-instructions.md`, `AGENTS.md`, `CLAUDE.md`, `.coderabbit.yaml`, `.gemini/` or `cubic` config | None |
| Supply-chain scanners | **Snyk** (`security/snyk` status on outside PRs), plus Dependabot security updates | None found |
| Release age | **Renovate `minimumReleaseAge: '7 days'`**, "don't raise a PR until a dependency is at least 7 days old". Rule 4: pin a burgee release at least 7 days old, never ask for an exception | Renovate is disabled (`"enabled": false`) |
| Deploy previews | `pkg-pr-new` check run (a preview package, not a deploy) | Docs preview workflow |
| Release tooling | `release-drafter`; versions bumped by the maintainer | **changeset-bot**: a PR needs a `.changeset/` file |
| Merge gates | No CODEOWNERS; `gh-merge-queue.yml`; `pr-renamer.yml` forces a `Chore\|CI\|Docs\|Feature\|Fix\|Refactor:` title | eddeee888 reviews |
| Contribution rules | CONTRIBUTING: tests for every change, docs updated, `npm test` run locally, squash-merge on the PR title | PR template |
| Others | `gh-first-interaction.yml` welcome comment; Codecov patch coverage; `node-license` job (an SPDX allow-list; MIT is on it) | `the-guild-org/shared-config` changesets-dependencies workflow |

## The target

| | |
| :-- | :-- |
| Repository | <https://github.com/emmercm/igir>, 953 stars, a personal repository, GPL-3.0 |
| Default branch HEAD | `744bc279`, 2026-10-28, "Chore: update lockfile (#2624)" |
| Latest release | v5.8.0, 2026-10-21 |
| Weekly downloads | 61,992 (2026-10-21..27) |
| Host | `yargs` pinned at `18.2.0`. Imported through `src/polyfill/yargsShim.ts` by `src/modules/argumentsParser.ts`, and directly by `scripts/compile.ts` |
| Shape | ESM, TypeScript, vitest, npm, Node `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0`. Ships as an npm package and as Bun-compiled single binaries (`bun scripts/compile.ts`) |
| CI | `node-lint`; `node-unit` (`npm run test:unit -- --project=native`) on six OS images with the package.json Node, plus Node 22 on three; `bun-unit`; `node-e2e` (`test/endToEndTest.sh`) on the package.json Node and 22; `node-license` |
| People | emmercm (Christian Emmer, 1,370 commits) writes, reviews and merges |

### The ask, in the maintainer's words

[#2249](https://github.com/emmercm/igir/issues/2249), "Replace 'yargs' with 'commander' or
something else", opened by emmercm on 2026-05-19, open, assigned to himself, no comments:

> The https://github.com/emmercm/igir/pull/2247 shim is extremely brittle.
>
> 'yargs' is quite slow, has six dependencies, and does filesystem reads at runtime. Most other solutions, such as https://www.npmjs.com/package/commander, are faster and have zero dependencies.

The shim answers [#2244](https://github.com/emmercm/igir/issues/2244): a Bun-compiled `igir.exe`
failed every command with `EUNKNOWN: unknown error, open 'B:\locales\en.json'` on a machine
whose `B:` drive was a DVD drive. #2247 seeds y18n from a static import of yargs' `en.json`, and
PR #2283 taught `scripts/compile.ts` to embed it. #2249 was opened the day #2247 merged.

What this does and does not license: he asked to replace yargs, and named commander. He did not
ask for burgee, for a yargs-compatible replacement, or for a pull request. So the approach is a
comment on #2249 asking first, never a cold PR.

### Rules checked

| Rule ([outreach-rejection-lessons]) | igir |
| :-- | :-- |
| 1. Disclose first | The comment's first sentence |
| 2. No new dependency where the stance is fewer | **The risk.** Recent commits replace dependencies with native or custom code: Moment.js (#2288), crc-32 (#2303), node-disk-info (#2325), 7z-iterator (#2472). His bar is commander's zero dependencies, and burgee has five. In igir's tree it is 3 fewer packages and 1.25 MB more. The comment says all of that, and that commander is a fine answer |
| 3. Governed organisation | No. A personal repository |
| 4. Supply-chain gates | Renovate's 7-day release age. The PR must pin a burgee release at least 7 days old |
| 5. No template batches | One comment, written for #2249 |
| 6. Fix first | The ask is itself the bug report (#2244's shim). The comment leads with it, and it can only be posted once burgee no longer has the same bug |
| 7. Reachability | Not a security claim |
| 8. CLA and contributor gates | None |
| 9. Claim only what CI runs | The suite named is the CI's: `npm run lint`, `npm run test:unit -- --project=native`, `test/endToEndTest.sh`, `bun scripts/compile.ts` |
| 10. Rule coverage | Not applicable |

## A3 — the proof, on published `burgee@1.9.2`

Run 2026-10-28 UTC (2026-10-29 local time) on macOS 26.2 (Darwin 25.2.0, Apple Silicon, 14
cores), load average 5 to 59 during the runs. Two `git clone --filter=blob:none` of
`744bc279`: `igir` (base) and `igir-pr` (the swap, then the revert). `npm ci --foreground-scripts`
in each. The suite is igir's CI steps: `npx tsc --noEmit`, `npm run lint`,
`vitest run --project=native`, and `test/endToEndTest.sh` (which runs `npm run build` first).
Bun 1.4.4 (igir's `.bun-version`, from npm) for `bun scripts/compile.ts`.

### What `burgee migrate` does on igir

`npx -y burgee@1.9.2 migrate` exits 1, **partial**, and does not move yargs:

```text
partial: 10 files rewritten, 1 refused
rewrote:
  chalk -> roundel/chalk  8 imports in 6 files
  strip-ansi -> linegauge/strip  4 imports in 4 files
  which -> bellpull/node-which  2 imports in 2 files
  terminal-link -> paratext/terminal-link  2 imports in 2 files
refused, and left exactly as it was:
  src/polyfill/yargsShim.ts:27  yargs/package.json  deep-import
  src/polyfill/yargsShim.ts:29  <not a literal>  non-literal-specifier
  src/polyfill/yargsShim.ts:30  <not a literal>  non-literal-specifier
  src/polyfill/yargsShim.ts:31  <not a literal>  non-literal-specifier
held, rewritten in no file:
  yargs  refused in src/polyfill/yargsShim.ts
still installed by another dependency:
  yargs through async; its YError would be different classes, so imports of them stay
…
graded by the incumbent's own suite:
  yargs  816 / 816 (the incumbent passes 814)
```

`migrate --only yargs` rewrites nothing and exits 1. Refusing is right: the shim reaches into
yargs' build files by computed paths, which no import rewrite can follow, and removing yargs
under it would crash at load. The rewrites of chalk, strip-ansi, which and terminal-link are out
of scope for #2249 and were discarded. One line is wrong: `async@3.2.6` lists yargs only in its
`devDependencies`, and `npm ls yargs` shows one copy. That is
[A-20261028-migrate-transitive-reads-dev-deps](../../gaps/A-20261028-migrate-transitive-reads-dev-deps.md).

So the change was made by hand, as the PR would make it: both imports point at `burgee/yargs`
(`import yargs, { type Argv } from 'burgee/yargs'`), the shim and its test are deleted, and
`npm install --save-exact burgee@1.9.2 && npm uninstall yargs`. Commit `7a0b3895`, tree
`696f32ef08f0`, authored as `Ofri Peretz <ofriperetzdev@gmail.com>`, local only. The diff is
`argumentsParser.ts` +1 / −2, `compile.ts` +1 / −1, `package.json` +2 / −2, `package-lock.json`
+77 / −95, and the shim (92 lines) and its test (53) deleted. The patch is
[`upstream-igir/0001-…patch`](../../intents/first-adopter/upstream-igir/0001-Refactor-replace-yargs-and-its-locale-shim-with-burg.patch).

### The suite

`0` is a passing exit. vitest is passed / total; the total differs by Node because igir has
Node-dependent cases, and by 6 between base and PR because the PR deletes the shim's 6 tests.

| Step | Node | tsc | lint | vitest `--project=native` | e2e |
| :-- | :-- | :-: | :-: | :-- | :-: |
| base (`744bc279`) | 22.22.0 | 0 | 0 | 5,122 / 5,123 | 1 † |
| | 24.22.0 | 0 | 0 | 5,125 / 5,127 ‡ | 0 |
| | 26.10.0 | 0 | 0 | 5,130 / 5,131 | 0 |
| after the swap to `burgee@1.9.2` (`7a0b3895`) | 22.22.0 | 0 | **1** | 5,116 / 5,117 | 1 † |
| | 24.22.0 | 0 | **1** | 5,117 / 5,121 ‡ | 0 |
| | 26.10.0 | 0 | **1** | 5,124 / 5,125 | 0 |
| after `git revert` (`e5a8ff85`) | 22.22.0 | 0 | 0 | 5,122 / 5,123 | 1 † |
| | 24.22.0 | 0 | 0 | 5,126 / 5,127 | 0 |
| | 26.10.0 | 0 | 0 | 5,130 / 5,131 | 0 |

The one failure left in every run is the same test, on every tree and Node:
`isFileOpen > should return true for an open file whose path has spaces and non-ASCII characters`
returns `false` in this scratch directory. It is environmental, and it is not counted against
either side.

† Node 22.22.0 is the newest 22 on this machine, and igir declares `^22.22.2`. igir's own engine
check refuses to start its built binary (`igir requires a Node.js version of ^22.22.2 || …`), so
the end-to-end script fails at its first command on all three trees. tsc, lint and vitest on 22
are valid; e2e on 22 is not measured.

‡ The first Node 24 runs also had 45 s timeouts under load: 1 on base (`candidateWriter`), 3 on
the swap (`igir.test.ts`, `directoryCleaner`, `candidateWriter`). Re-running those four files
alone, each tree passes all but `isFileOpen` (210 / 211 on both).

### Checks

| Check | Result |
| :-- | :-- |
| `npx -y burgee@1.9.2 migrate` | **exit 1, partial**: yargs held (the shim is refused); the swap is made by hand |
| `tsc --noEmit` on the swap | pass on Node 22, 24 and 26 |
| `npm run lint` on the swap | **fail**: 1 error, `@typescript-eslint/no-base-to-string` (gap 3) |
| vitest and `test/endToEndTest.sh` | the same as base on every Node (table above) |
| `--help` | byte-identical, `485f67b4…`, 278 lines |
| 44 argument vectors, both built trees | **39 identical**; the 5 that differ are burgee's reserved shapes (gap 2). Control, base against base: 44 / 44 |
| `bun scripts/compile.ts` (Bun 1.4.4) | base: builds, and its `--help` check passes from an empty directory. Swap: builds, and **fails** its check: the binary throws at load (gap 1) |
| A locale read failing with `EUNKNOWN`, as in #2244 | swap: every invocation fails, `--help` and a valid `copy` included (gap 1) |
| `git revert` | `744bc279^{tree}` = `HEAD^{tree}` = `edb663eb8a99…`; the suite as base after it |
| `npm audit --omit=dev` | 0 before, 0 after |
| `bun-unit` (`bun test`) | not run |

### The three burgee failures

**1. The compiled binary throws on every invocation**
([A-20261028-yargs-locale-read-at-runtime](../../gaps/A-20261028-yargs-locale-read-at-runtime.md)).
`bun scripts/compile.ts` builds a 94.7 MB binary for both trees. The base binary passes the
script's own check (`--help` from an empty directory, exit 0, 278 lines). The migrated binary
fails it:

```text
ENOENT: no such file or directory, scandir '/$bunfs'
      at findUp (/$bunfs/root/igir-pr-bin:67987:36)
```

`burgee/yargs`' shim walks up from its own file at module load to find `package.json`, so that
it can read `locales/en.json` later. Inside a Bun binary that walk reaches the virtual `/$bunfs`
and `readdirSync` throws. `igir-pr-bin copy --input … --output …` fails the same way. This is
macOS; igir's #2244 was Windows-only, so burgee makes the binary worse than yargs did, not
equal. Under Node, a preload that makes any `locales/*.json` read fail with `EUNKNOWN`, as the
read in #2244 did, makes every migrated invocation fail with that error, a valid `copy` included, with
one read of `node_modules/burgee/locales/en.json` logged each time. (The same preload on the base
tree fails too, at the shim's `require()` of yargs' `en.json` at load: under Node that is a disk
read, and only `compile.ts` embeds it. The binary is what ships, and there the base passes.)

**2. The reserved surfaces misbehave under `.parse(argv, {}, callback)`**
([A-20261028-yargs-parse-callback-surfaces](../../gaps/A-20261028-yargs-parse-callback-surfaces.md)).
igir parses with the callback form and uses the return value at once. The 5 vectors that differ:

| argv | yargs 18.2.0 + shim | burgee 1.9.2 |
| :-- | :-- | :-- |
| `--json` | help, "You must specify at least one command", exit 1 | help, then `Cannot read properties of undefined (reading 'getLogLevel')`, exit 1 |
| `copy --input <dir> --output <dir> --json` | `copy` help, "Unknown argument: json", exit 1 | `{"ok":true,"data":null,…}` on stdout, then the run, "no files found", exit 1 |
| `--schema` | help, "You must specify at least one command", exit 1 | no schema; igir runs with no command, scans, fails, exit 1 |
| `--mcp` | the same as `--schema`, exit 1 | `options.getLogLevel is not a function`, exit 1; no server |
| `completion zsh` | help, "Unknown commands: completion, zsh", exit 1 | `options.getLogLevel is not a function`, exit 1; no script |

A minimal program reproduces each against `.parseSync()`, where `--schema`, `--mcp` and
`completion` work. `--json` on a program with no handler prints `"ok": true` ahead of work it
has not run under both shapes.

**3. Lint fails on the migrated tree**
([A-20261028-yargs-argv-type-call-signature](../../gaps/A-20261028-yargs-argv-type-call-signature.md)).
`tsc --noEmit` passes, `npm run lint` does not:

```text
src/modules/argumentsParser.ts
  1324:33  error  '_yargs.help()' will use Object's default stringification format ('[object Object]') when stringified  @typescript-eslint/no-base-to-string
```

`@types/yargs`' `Argv` has a call signature, so its apparent `toString` is `Function`'s;
burgee's `Argv` has none. `scripts/drop-in-type-surface-lock.test.ts` checks names, not shapes.

### What the adopter would get, measured

| | yargs 18.2.0 (base) | burgee 1.9.2 | change |
| :-- | --: | --: | :-- |
| igir production entries in `package-lock.json` | 132 | 129 | **−3**: yargs and 8 packages only it pulled in out, burgee and 5 in |
| Host installed alone (`npm i --omit=dev`) | 15 entries (13 names), 536,517 B | 6 packages, 1,727,552 B | 3.2× the bytes |
| Bytes of the removed and added directories in igir | 474,062 | 1,727,552 | **+1,253,490** |
| npm maintainer accounts on the host installed alone | 9 (two of them bots) | 1 (ofriperetz) | |
| `npm audit --omit=dev` | 0 | 0 | adds 0 advisories |
| Licences added | | MIT ×6 | on igir's `node-license` allow-list |
| `igir --help` cold start, 20 paired interleaved runs | 453.5 / 460.1 / 487.5 ms median | 434.6 / 449.5 / 415.8 ms median | 10 to 72 ms faster per round, ranges overlapping |

So, against the three reasons in #2249: **speed**, slightly faster on `--help`, within the
spread; **six dependencies**, five, all one maintainer's, against a named bar of zero;
**filesystem reads at runtime**, not met on 1.9.2, and worse in the binary.

### Friction found (A4)

Each point is a gap or a decision, as A4 requires.

1. The single binary throws at load, and English is read from disk:
   [A-20261028-yargs-locale-read-at-runtime](../../gaps/A-20261028-yargs-locale-read-at-runtime.md).
   Blocks the comment.
2. The reserved surfaces under `.parse(argv, {}, cb)`:
   [A-20261028-yargs-parse-callback-surfaces](../../gaps/A-20261028-yargs-parse-callback-surfaces.md).
   Blocks the comment.
3. `Argv` lacks `@types/yargs`' call signature, so igir's lint fails:
   [A-20261028-yargs-argv-type-call-signature](../../gaps/A-20261028-yargs-argv-type-call-signature.md).
   Blocks the comment.
4. `migrate` reads installed dependencies' `devDependencies`:
   [A-20261028-migrate-transitive-reads-dev-deps](../../gaps/A-20261028-migrate-transitive-reads-dev-deps.md).
   Does not block; igir imports no `YError`.
5. `migrate` cannot move a project that reaches into the incumbent's build files by computed
   paths, as igir's shim does. It refuses, which is correct, and the swap is hand-made. Decided
   not to fix in the decision: no rewrite can follow a computed path, and the refusal is the
   safe outcome.

### A2 report, so far

- **Time.** The hand swap took minutes. The proof took about 2 hours of wall time on a loaded
  laptop: two installs, nine suite runs, the parity harness, two Bun compiles, footprint and
  cold start.
- **Lines changed.** 9 source and manifest lines in 3 files, 2 files deleted (145 lines), and the
  lockfile (+77 / −95).
- **What broke.** The shipped artefact, the Bun binary, on every invocation. Lint. Five reserved-flag
  vectors. Not igir's vitest suite or its end-to-end script.
- **What was missing.** A default locale that needs no file, surfaces that hold under the
  callback form of `.parse()`, and the `Argv` call signature.

Written by the agent that ran the proof, as a draft for the A2 review, not the review.

[outreach-rejection-lessons]: ../../intents/first-adopter/adoption-draft.md#outreach-checks
[outreach-bot-recon]: ../../intents/first-adopter/adoption-draft.md#outreach-checks
