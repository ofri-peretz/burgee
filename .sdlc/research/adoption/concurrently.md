# Adoption target: `open-cli-tools/concurrently`

Intent [`first-adopter`](../../intents/first-adopter/spec.md), build step 1 (choose and record the
target) and step 2 (A3, revert first). Chosen 2026-10-27 by
[D-20261027-first-adopter-target-concurrently](../../decisions/D-20261027-first-adopter-target-concurrently.md).
The pull request draft is [`adoption-draft.md`](../../intents/first-adopter/adoption-draft.md).

**One comment was posted**, on #418 on 2026-10-28 (https://github.com/open-cli-tools/concurrently/issues/418#issuecomment-6455508479). No pull request, issue, fork or star
was made on any repository outside `ofri-peretz/*`. Every read of GitHub was a read-only `gh api` call, and the proof ran in
a shallow clone under `mktemp -d`.

**State until 2026-10-28: proven, held again.** The migration and its revert are green on the project's own suite.
The first burgee bug found on the way,
[A-20261027-yargs-parsesync-surfaces-throw](../../gaps/A-20261027-yargs-parsesync-surfaces-throw.md),
is fixed in `burgee@1.8.0`. The re-run on 1.8.0 ([below](#re-run-on-burgee180-2026-10-27)) passes
every check but one: `concurrently --mcp` no longer crashes, but it does not serve either. That is
[A-20261027-yargs-parsesync-mcp-ended-by-exit](../../gaps/A-20261027-yargs-parsesync-mcp-ended-by-exit.md),
and it held the #418 comment the owner had approved on the condition that `--mcp` starts a server.
On 2026-10-28 the owner chose to post a revised text that states `--mcp` is unchanged for
concurrently. It was posted once: <https://github.com/open-cli-tools/concurrently/issues/418#issuecomment-6455508479>.

**State 2026-10-28: proven on `burgee@1.9.1`, every check green, the PR being opened.** The
re-run on the published fix ([below](#re-run-on-burgee191-2026-10-28)) passes every check, and
`concurrently --mcp` now answers `initialize` and `tools/list`. The owner approved opening the
pull request without waiting for a maintainer reply. It is being opened by the owner from the
local branch and the files in
[`first-adopter/upstream/`](../../intents/first-adopter/upstream/); nothing was pushed or posted
by the agent that ran the proof.

## The target

| | |
| :-- | :-- |
| Repository | <https://github.com/open-cli-tools/concurrently>, 7,864 stars, organisation-owned |
| Last commit | `2a80d44`, 2026-10-25, "fix: forward signals to the teardown command (#630)" |
| Latest release | v10.0.6, 2026-10-08 |
| Weekly downloads | 15,783,555 (2026-09-15..21, from [`adoption-targets.md`](../adoption-targets.md)) |
| Host | `yargs` pinned at `18.0.0`, one import site (`bin/index.ts`: `yargs` and `yargs/helpers`) |
| Shape | ESM only since #568 (2025-10), TypeScript, vitest, pnpm 10.18.2, `engines.node >=22` |
| CI | lint, prettier, typecheck; vitest with coverage on Node 22, 24 and 26 × Ubuntu, Windows, macOS |
| People | gustavohenke (274 commits) reviews and merges; paescuj (99) maintains |

### Why this one

The spec's three filters, and what concurrently gives for each:

1. **It uses an incumbent the family grades.** It pins yargs 18.0.0, and `burgee/yargs` is graded
   816 / 816 by yargs' own suite (the published `burgee@1.7.2 migrate` report).
2. **It has an open issue the swap answers.** The issue is in their tracker, not in
   `.sdlc/research/issues/`.
   [#418](https://github.com/open-cli-tools/concurrently/issues/418), "Switch from yargs to
   commander to remove 16 dependencies", is open and labelled `pending for input`. The top
   maintainer answered it on 2023-04-09. He would take a PR that drops yargs if it keeps full
   compatibility and has decent TypeScript types, and he asked to agree on the library first.
   In 2024 he also ruled out ESM-only libraries, because concurrently still served CommonJS. #568
   made concurrently ESM-only in 2025-10, so that objection is gone. A maintainer of commander
   and yargs commented on the issue too. He named the two yargs features a rewrite would have to
   match: `.env('CONCURRENTLY')` and `.group()`.
3. **A maintainer can review it in an evening.** The source diff is 4 lines in two files.

The outreach rules ([outreach-rejection-lessons], [outreach-bot-recon]) were checked against this
repository. The draft lists each one.

- **No CLA or ECA.** No workflow or bot for one, and the statuses on #630, #631 and #634 are
  Coveralls only.
- **No stale bot.**
- **No AI reviewer config.** There is no `.coderabbit.yaml`, `copilot-instructions.md`, `AGENTS.md`
  or `CLAUDE.md`.
- **No supply-chain scanner and no release-age window.**
- **Outside PRs get merged.** gustavohenke merged #630, #631 and #634 from first- and second-time
  contributors 2 to 8 days after they were opened.
- **The repository is not shrinking its dependency list.** The one dependency issue is #418
  itself, and this change removes packages.

### Rejected candidates

| Candidate | Why not |
| :-- | :-- |
| [apify/mcpc](https://github.com/apify/mcpc) | Ofri's #447 (chalk and ora to roundel and flagstaff) was closed by the top contributor the same day, with no comment. Tier D: never re-pitch cold |
| [pa11y/pa11y-ci](https://github.com/pa11y/pa11y-ci) and [pa11y/pa11y](https://github.com/pa11y/pa11y) | They had the best issue fit (#228, #55, #529), but the repository is shrinking its dependencies: "Replace chalk with kleur", then "Replace kleur with native util.StyleText". On commander, `burgee/commander` turns 1 package into 6 and costs 8.2× the bytes (rule 2). #228's fix needs no burgee at all (rule 6: fix first). #738 on pa11y already carries templated outreach |
| [devcontainers/cli](https://github.com/devcontainers/cli) | #1257 (shell completions) is the cleanest fit there is. But it is a Microsoft repository: a CLA is Ofri's own act (rule 8), and a governed organisation will not take a two-month-old, single-maintainer package (rule 3) |
| [postcss/postcss-cli](https://github.com/postcss/postcss-cli) | Its recent commits remove dependencies: fs-extra went to native fs, globby to tinyglobby. It belongs to the team behind picocolors and size-limit, so +1.2 MB of bytes would read as the opposite of their policy (rule 2) |
| semantic-release, spectral, dependency-cruiser, markdownlint-cli | semantic-release holds npm publish tokens in most release pipelines, so it is supply-chain-critical. Spectral is a corporate repository with slow triage. Both need a handler refactor before `--json` means anything. dependency-cruiser and markdownlint-cli are on commander (1 package becomes 6), have careful sole maintainers, and have no issue to cite |

## A3 — the proof, revert first

Run on 2026-10-27 on macOS 26.2 (Darwin 25.2.0, Apple Silicon) with Node 24.12.0 and the pinned
pnpm 10.18.2. The clone was `git clone --depth 1` of `2a80d44` into `mktemp -d -t fa-concurrently`.
The suite is the steps CI runs: `pnpm run build`, `typecheck`, `lint` and `format`, then
`pnpm exec vitest run` (unit and smoke projects).

| Step | build | typecheck | lint | format | vitest | `--help` |
| :-- | :-: | :-: | :-: | :-: | :-- | :-- |
| base (`2a80d44`) | 0 | 0 | 0 | 0 | 649 / 649 | 105 lines |
| after `burgee@1.7.2 migrate` | 0 | 0 | 0 | 0 | **649 / 649** | byte-identical |
| after `git revert` | 0 | 0 | 0 | 0 | **649 / 649** | byte-identical |
| PR shape (exact pin `1.7.2`) | 0 | 0 | 0 | 0 | **649 / 649** | byte-identical |

The migrated tree and the reverted tree also pass 649 / 649 on Node 22.22.0 and on Node 26.10.0.

### Transcript

```text
$ npx -y burgee@1.7.2 migrate            # the published version, run from the clone
complete: 1 file rewritten
rewrote:
  yargs -> burgee/yargs  1 import in 1 file
  yargs/helpers -> burgee/yargs/helpers  1 import in 1 file
still installed by another dependency:
  yargs through safe-publish-latest; its YError would be different classes, so imports of them stay
on a major that was not graded, left alone:
  chalk 5.6.2 (graded 6.0.1); nearest claimed 6
  supports-color 10.2.2 (graded 11.0.0); nearest claimed 11
graded by the incumbent's own suite:
  chalk  59 / 59 (the incumbent passes 59)
  supports-color  55 / 55 (the incumbent passes 55)
  yargs  816 / 816 (the incumbent passes 814)
declared: yargs, chalk, supports-color
imported: chalk, supports-color, yargs
add: burgee
removable: yargs
next: pnpm add burgee@^1.7.2 && pnpm remove yargs
migrate exit=0

$ pnpm add burgee@^1.7.2 && pnpm remove yargs      # exactly as printed
next exit=0
 M bin/index.ts   (2 lines)   M package.json (2 lines)   M pnpm-lock.yaml (+49 / −81)

$ git commit -am "chore: replace yargs with burgee/yargs"     # 76dec2e
$ git revert --no-edit HEAD                                  # 5df1ba3
$ git rev-parse 2a80d44^{tree} HEAD^{tree}
74d047518f7dc443c8e7ea8c5c3adb0e05d562e4
74d047518f7dc443c8e7ea8c5c3adb0e05d562e4                     # the revert restores the tree exactly
$ pnpm install --frozen-lockfile && <suite>
rev vitest exit=0  tests total=649 passed=649 failed=0

# the PR shape: exact pin, authored as ofriperetzdev@gmail.com (local only)
$ git switch -c pr-draft 2a80d44 && <apply> && git commit    # da4bdc6
$ node agents/footprint/scripts/preflight-outreach.mjs <clone> --base 2a80d44
preflight: clean — no known-fatal defect in this diff.
$ git revert --no-edit da4bdc6                               # tree identical to 2a80d44 (74d0475)
$ pnpm install --frozen-lockfile && pnpm run build && pnpm exec vitest run
      Tests  649 passed (649)
```

**The revert is one command, `git revert <sha>`, and the suite stays green after it.** A3 holds.

### Behaviour beyond the suite

The suite never sees argument shapes that burgee reserves for itself. So both `npm pack` tarballs
were installed into empty directories, and each binary ran 40 argument vectors. The vectors cover
every option group in `--help`, `-P` passthrough, invalid values, unknown flags, three
`CONCURRENTLY_*` environment variables (the `.env()` that #418's commander comment named), and
burgee's reserved surfaces. `FORCE_COLOR=0`, timings normalised.

**36 of 40 are identical**: stdout, stderr and exit code. That includes `--help` with all five
`.group()` headings, all three environment variables, `-q`, `--quiet`, `--timeout 1ms`,
`--explain names` and `--color never`. The 4 that differ are all burgee's reserved surfaces:

| argv | yargs 18.0.0 | burgee 1.7.2 |
| :-- | :-- | :-- |
| `-m 1 --json "echo a"` | `--json` takes `echo a` as its value, so there are no commands; prints help, exit 0 | `--json` is a boolean; runs `echo a`, with no envelope, exit 0 |
| `--schema "echo a"` | the same: help, exit 0 | prints a schema with `"commands": []`, exit 0 |
| `--mcp` | help, exit 0 | **crashes**: `YError: .parseSync() must not be used with asynchronous builders…`, a stack trace, exit 1 |
| `completion zsh` | runs a shell command named `completion`: `command not found`, exit 1 | **crashes**: the same YError and stack trace, exit 1 |

The two crashes are a burgee bug, not a concurrently problem. `#burgeeSurface`
(`packages/burgee/src/yargs/factory.ts`) returns a promise for `completion` and `--mcp`, because it
lazy-loads their modules, and `parseSync()` throws on any promise. Any `burgee/yargs` program that
calls `parseSync()` crashes when someone types `prog --mcp` or `prog completion …`. It is the same
on `main`; no source has changed since `burgee@1.7.2`. A minimal three-line program reproduces it,
and it reproduces with a `$0` handler too. Recorded as
[A-20261027-yargs-parsesync-surfaces-throw](../../gaps/A-20261027-yargs-parsesync-surfaces-throw.md).
**This is why the draft is held.** One of the maintainer's two conditions was "full
compatibility", and a stack trace on `concurrently --mcp` contradicts it.

The empty schema is by design, not a bug. concurrently does its work after `parseSync()` returns
and registers no handler, and neither façade lists a program that has no runnable command. A
commander program with options and no `.action()` also prints `"commands": []`. Until
concurrently's run moves into a `$0` handler, `--schema`, `--mcp` and the completion script carry
no options. So the draft does not claim the agent surfaces for concurrently.

### What the adopter gets, measured

Each tarball was installed alone with `npm i --omit=dev` into an empty directory.

| | yargs 18.0.0 (base) | burgee 1.7.2 | change |
| :-- | --: | --: | :-- |
| Packages installed besides concurrently | 19 | 12 | **−7** |
| The host's own subtree | yargs + 12 = 13 packages | burgee + 5 = 6 packages | −7 |
| Bytes of that subtree | 511,460 | 1,720,132 | **+1,208,672 (3.4×)** |
| Bytes of all dependencies | 5,197,549 | 6,403,191 | +1,205,642 (+23%) |
| npm maintainer accounts in the host subtree | 8 | 1 (ofriperetz) | one person instead of eight |
| `npm audit --omit=dev` | 0 | 0 | adds 0 advisories |
| concurrently's own tarball | 282,676 B | 282,679 B | +3 B |

Cold start was measured on `--version`, 20 paired, interleaved runs per round, on a laptop at load
average 10 to 14:

| Round | yargs, median (range) | burgee, median (range) |
| :-- | --: | --: |
| 1 | 193.7 ms (167.6–275.5) | 173.2 ms (157.2–273.7) |
| 2 | 168.5 ms (159.2–213.0) | 158.1 ms (149.3–182.7) |
| 3 | 183.8 ms (163.8–325.2) | 162.6 ms (149.6–192.4) |
| Running two commands, `"node -e 0" "node -e 0"` | 222.5 ms (208.2–358.2) | 218.3 ms (193.7–448.1) |

On `--version` the median was 10 to 21 ms faster in every round. A real two-command run is within
noise. The draft states it that way, or leaves it out.

**The honest pitch** answers #418 as it was asked. It removes 7 packages and yargs' 12 transitive
dependencies, keeps the yargs API concurrently already uses (no rewrite), and keeps TypeScript
types: typecheck passes against `burgee/yargs`' own `.d.ts`. `.env()` and `.group()` behave as
before. It is **not** smaller: the dependency bytes grow by 1.2 MB. It is not lower-risk either:
eight maintainer accounts become one, on a package that is two months old. It does carry SLSA
provenance on every release.

### Re-run on `burgee@1.8.0`, 2026-10-27

The owner approved a disclosed comment on #418 on one condition: the whole proof re-run on the
published fix, with `--mcp` and `completion` now working, and nothing posted if any check failed.
This is that run. **One check failed, so nothing was posted.**

Same machine and method as above: a fresh `git clone --depth 1` of `2a80d44` (still the default
branch HEAD) into `mktemp -d -t fa18-concurrently`, pnpm 10.18.2, the CI steps under each Node.

| Step | Node | build | typecheck | lint | format | vitest |
| :-- | :-- | :-: | :-: | :-: | :-: | :-- |
| base (`2a80d44`) | 22.22.0 | 0 | 0 | 0 | 0 | 649 / 649 |
| | 24.12.0 | 0 | 0 | 0 | 0 | 649 / 649 (first run 648: the cjs-import smoke test hit its 5 s timeout at load average ~140; the re-run passed) |
| | 26.10.0 | 0 | 0 | 0 | 0 | 649 / 649 |
| after `burgee@1.8.0 migrate` | 22.22.0 | 0 | 0 | 0 | 0 | **649 / 649** |
| | 24.12.0 | 0 | 0 | 0 | 0 | **649 / 649** |
| | 26.10.0 | 0 | 0 | 0 | 0 | **649 / 649** |
| after `git revert` | 22.22.0 | 0 | 0 | 0 | 0 | **649 / 649** |
| | 24.12.0 | 0 | 0 | 0 | 0 | **649 / 649** |
| | 26.10.0 | 0 | 0 | 0 | 0 | **649 / 649** |

```text
$ npx -y burgee@1.8.0 migrate
complete: 1 file rewritten
…
graded by the incumbent's own suite:
  yargs  816 / 816 (the incumbent passes 814)
…
next: pnpm add --save-exact burgee@1.8.0 && pnpm remove yargs     # exact, as B-20261027 wanted
$ pnpm add --save-exact burgee@1.8.0 && pnpm remove yargs          # exactly as printed, exit 0
 M bin/index.ts (2 lines)   M package.json ("burgee": "1.8.0", yargs removed)   M pnpm-lock.yaml (+49 / -81)
$ git commit -am "chore: replace yargs with burgee/yargs"           # f37ef3f
$ node dist/bin/index.js --help | shasum                            # 022489e3… before and after: byte-identical
$ git revert --no-edit HEAD                                         # 6944f6f
$ git rev-parse 2a80d44^{tree} HEAD^{tree}
74d047518f7dc443c8e7ea8c5c3adb0e05d562e4
74d047518f7dc443c8e7ea8c5c3adb0e05d562e4                            # the revert restores the tree exactly
```

**Argument vectors.** The 40-vector harness from the first run was not kept, so it was rebuilt:
41 vectors over every `--help` group, `-P` passthrough, `-i` input, `--teardown`, an invalid
number, an unknown flag, no arguments, three `CONCURRENTLY_*` variables and the four reserved
shapes, run through both packed tarballs installed alone. Concurrent children interleave
nondeterministically: a yargs-against-yargs control differed on 3 of 41 in a single pass. So each
side gets up to 8 runs, and a vector counts as identical when the two sides share an outcome
(stdout, stderr and exit code, timestamps and durations normalised). The control is then 41 / 41.

**38 of 41 are identical**, `--mcp` among them. The 3 that differ are burgee's reserved shapes:

| argv | yargs 18.0.0 | burgee 1.8.0 |
| :-- | :-- | :-- |
| `-m 1 --json "echo a"` | `--json` takes `echo a` as its value; help, exit 0 | `--json` is a boolean; runs `echo a`, exit 0 |
| `--schema "echo a"` | help, exit 0 | prints the schema, `"commands": []`, exit 0 |
| `completion zsh` | runs a command named `completion`: `command not found`, exit 1 | **prints a zsh completion script**, exit 0 |
| `--mcp` | help on stderr, exit 0 | **the same**: help on stderr, exit 0, no reply on stdout |

`completion zsh` is fixed. `--mcp` no longer crashes, but it does not serve: with an `initialize`
request on stdin and stdin held open for 2 s, stdout stays empty. `parseSync()` now returns while
the server starts, and concurrently's own `if (!commands.length) { program.showHelp();
process.exit(); }` ends the process first. Recorded as
[A-20261027-yargs-parsesync-mcp-ended-by-exit](../../gaps/A-20261027-yargs-parsesync-mcp-ended-by-exit.md).
The owner's go required `--mcp` to start a server, so the comment was not posted that day. The
owner then approved a revised text, posted 2026-10-28.

**Footprint**, each tarball installed alone with `npm i --omit=dev`:

| | yargs 18.0.0 | burgee 1.8.0 |
| :-- | --: | --: |
| Packages besides concurrently | 19 | 12 |
| Host subtree bytes | 511,460 (yargs + 12) | 1,721,094 (burgee + 5) |
| All dependency bytes | 5,188,715 | 6,398,349 |
| npm maintainer accounts in the host subtree | 8 | 1 (ofriperetz, on all six) |
| `npm audit --omit=dev` | 0 | 0 |

burgee was first published 2026-09-07.

### Re-run on `burgee@1.9.1`, 2026-10-28

`burgee@1.9.1` (published 2026-10-28T03:05Z) is the first release with #1325, which serves
`--mcp` under `parseSync()` until its input ends
([D-20261028-yargs-parsesync-mcp-serves-synchronously](../../decisions/D-20261028-yargs-parsesync-mcp-serves-synchronously.md)).
Its tarball's `dist/mcp.js` and `dist/yargs/factory.js` carry `serveMcpSync`. **Every check
passed.**

Same machine and method: macOS 26.2 (Darwin 25.2.0, Apple Silicon), pnpm 10.18.2, the CI steps
under each Node. A fresh `git clone --filter=blob:none` of the default branch. Its HEAD is still
`2a80d44da6c4` ("fix: forward signals to the teardown command (#630)"), so the research commit
and the current HEAD are the same SHA. Load average ran from 10 to 86 during the run.

| Step | Node | build | typecheck | lint | format | vitest |
| :-- | :-- | :-: | :-: | :-: | :-: | :-- |
| base (`2a80d44`) | 22.22.0 | 0 | 0 | 0 | 0 | 649 / 649 |
| | 24.12.0 | 0 | 0 | 0 | 0 | 649 / 649 |
| | 26.10.0 | 0 | 0 | 0 | 0 | 649 / 649 |
| after `burgee@1.9.1 migrate` (`d0da17b`) | 22.22.0 | 0 | 0 | 0 | 0 | **649 / 649** (first run 648: the `cjs-import` smoke test hit its 5 s timeout at load average 86, as the 1.8.0 base run's did; the re-run passed) |
| | 24.12.0 | 0 | 0 | 0 | 0 | **649 / 649** |
| | 26.10.0 | 0 | 0 | 0 | 0 | **649 / 649** |
| after `git revert` (`982bce3`) | 22.22.0 | 0 | 0 | 0 | 0 | **649 / 649** |
| | 24.12.0 | 0 | 0 | 0 | 0 | **649 / 649** |
| | 26.10.0 | 0 | 0 | 0 | 0 | **649 / 649** |

| Check | Result |
| :-- | :-- |
| `npx -y burgee@1.9.1 migrate` | exit 0; 2 imports rewritten in `bin/index.ts`; yargs graded 816 / 816 (the incumbent passes 814) |
| `migrate` writes the exact pin | `next: pnpm add --save-exact burgee@1.9.1 && pnpm remove yargs`; run as printed, `package.json` gets `"burgee": "1.9.1"` |
| Diff | `bin/index.ts` 2 / 2, `package.json` 2 / 2, `pnpm-lock.yaml` +49 / −81 |
| Suite, Node 22, 24 and 26 | 649 / 649 base, migrated and reverted (table above) |
| `--help` | byte-identical: `022489e3…` base, migrated and reverted, 105 lines |
| 41 argument vectors | **37 identical**; the 4 that differ are burgee's reserved shapes. Control, yargs against yargs: 41 / 41 |
| A normal run, `concurrently "echo a" "echo b"` | identical: `[0] a`, `[1] b`, both exited with code 0, exit 0 |
| `git revert` | `2a80d44^{tree}` = `HEAD^{tree}` = `74d047518f7d…`; suite green |
| `completion zsh` | prints `#compdef concurrently`, exit 0 |
| `concurrently --mcp` | **serves**: answers `initialize` and `tools/list`, exit 0 when stdin ends, nothing on stderr |
| `preflight-outreach.mjs --base 2a80d44` | `preflight: clean — no known-fatal defect in this diff.` |
| `npm audit --omit=dev` | 0 before, 0 after |

**`--mcp` replies.** Through the packed and installed binary, with `initialize`,
`notifications/initialized` and `tools/list` on stdin, then stdin closed:

```text
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{}},"serverInfo":{"name":"concurrently","version":"10.0.6"}}}
{"jsonrpc":"2.0","id":2,"result":{"tools":[]}}
```

Exit 0, stderr empty. A second probe held stdin open and sent each request only after the previous
reply: `initialize` answered at +206 ms and `tools/list` at +211 ms. The process was still alive
2 s later, with stdin open, and exited 0 when stdin closed. On `burgee@1.8.0` the same input got
the help screen on stderr and nothing on stdout. `tools` is empty by design: concurrently runs
after `parseSync()` returns and registers no handler (friction 3).

**The four vectors that differ**, each burgee's reserved shape:

| argv | yargs 18.0.0 | burgee 1.9.1 |
| :-- | :-- | :-- |
| `-m 1 --json "echo a"` | `--json` takes `echo a` as its value; help, exit 0 | `--json` is a boolean; runs `echo a`, exit 0 |
| `--schema "echo a"` | help, exit 0 | prints the schema, `"commands": []`, exit 0 |
| `completion zsh` | runs a command named `completion`: `command not found`, exit 1 | prints a zsh completion script, exit 0 |
| `--mcp` | help on stderr, exit 0 | **serves**: the two replies above, exit 0 at end of input |

`--mcp` moved from "identical" (1.8.0) to "differs", which is the fix working: it used to fall
through to help. One consequence to state upstream: `concurrently --mcp` typed in a terminal now
waits on stdin until Ctrl-D, where it used to print help.

**Footprint**, each tarball installed alone with `npm i --omit=dev`:

| | yargs 18.0.0 | burgee 1.9.1 |
| :-- | --: | --: |
| Packages besides concurrently | 19 | 12 |
| Host subtree | yargs + 12, 511,460 B | burgee + 5 (bellpull, closeout, linegauge, roundel, seniority), 1,727,552 B |
| All dependency bytes | 5,188,715 | 6,404,807 |
| npm maintainer accounts in the host subtree | 8 | 1 (ofriperetz) |
| `npm audit --omit=dev` | 0 | 0 |

**The pull request, ready locally.** In the proof clone, branch `burgee-yargs` is one commit,
`d0da17b924e2`, on `2a80d44`, authored as `Ofri Peretz <ofriperetzdev@gmail.com>` with the
message `refactor: use burgee/yargs as a drop-in for yargs`. concurrently's own husky and
lint-staged hook ran on it. `git format-patch` of that commit is
[`upstream/0001-refactor-use-burgee-yargs-as-a-drop-in-for-yargs.patch`](../../intents/first-adopter/upstream/0001-refactor-use-burgee-yargs-as-a-drop-in-for-yargs.patch).
Applied with `git apply --index` to `2a80d44`, it gives tree `3c9f1a3080d2`, the branch's tree.
Title and body are [`upstream/pr-title.txt`](../../intents/first-adopter/upstream/pr-title.txt) and
[`upstream/pr-body.md`](../../intents/first-adopter/upstream/pr-body.md).

### Friction found (A4)

Each point is a gap or a decision, as A4 requires.

1. **`parseSync()` programs crash on `--mcp` and `completion …`**:
   [A-20261027-yargs-parsesync-surfaces-throw](../../gaps/A-20261027-yargs-parsesync-surfaces-throw.md).
   Fixed in `burgee@1.8.0` (#1311); `completion zsh` now prints a script.
2. **migrate's `next` writes `^1.7.2` into a manifest that pins every runtime dependency
   exactly**: [B-20261027-migrate-pins-match-exact-convention](../../gaps/B-20261027-migrate-pins-match-exact-convention.md).
   The PR shape was pinned by hand to `1.7.2`. Fixed in `burgee@1.8.0`: `next` now prints
   `pnpm add --save-exact burgee@1.8.0`.
3. **A program with no handler gets an empty `--schema`.** This is decided by design: the PR does
   not claim the agent surfaces. See the decision.
4. **The engines floor is one patch line above concurrently's.** burgee declares
   `^20.19.0 || >=22.13.0` and concurrently declares `>=22`. yargs 18.0.0 already declares
   `^20.19.0 || ^22.12.0 || >=23`, so the real gap is 22.12.x only. The migrated binary runs on
   22.11.0 and 22.12.0. npm prints EBADENGINE there and pnpm does not refuse. Decided not to fix
   (D-132's floor); the draft says so.
5. **`--mcp` under `parseSync()` is ended by the program's own `process.exit()`**:
   [A-20261027-yargs-parsesync-mcp-ended-by-exit](../../gaps/A-20261027-yargs-parsesync-mcp-ended-by-exit.md).
   Found by the 1.8.0 re-run. It held the #418 comment for a day; the posted text says `--mcp` is
   unchanged for concurrently and promises no fix. Fixed in `burgee@1.9.1` (#1325): the 1.9.1
   re-run gets `initialize` and `tools/list` replies from `concurrently --mcp`.

### A2 report, so far

- **Time.** migrate and its `next` took under 10 seconds. The proof took about 40 minutes of wall
  time: install, four suite runs, the parity harness, footprint and cold start.
- **Lines changed.** 4 source and manifest lines in 2 files, plus the lockfile (+49 / −81).
- **What broke.** Nothing in the project's suite, on three Node majors. Outside the suite, on
  1.7.2, two argument shapes crashed (friction 1), and on 1.8.0 `--mcp` did not serve (friction 5).
  On 1.9.1 nothing breaks; the four reserved shapes behave as the PR body lists.
- **What was missing.** Agent surfaces for a program with no handler (friction 3), and pin style
  (friction 2).

A2 asks for the report to be written by someone who did not build the layer. This one was written
by the agent that ran the proof. It is a draft for that review, not the review.

[outreach-rejection-lessons]: ../../intents/first-adopter/adoption-draft.md#outreach-checks
[outreach-bot-recon]: ../../intents/first-adopter/adoption-draft.md#outreach-checks
