# hookset

## 1.3.0

### Minor Changes

- [#1872](https://github.com/ofri-peretz/burgee/pull/1872) [`01a441f`](https://github.com/ofri-peretz/burgee/commit/01a441f266e5be55b798f09bf9e64436e1497896) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The Claude Code `guard-bash` hook now lints a `git commit -m …` / `-F …` message before the commit runs. It uses the repo's own commitlint config and, where the repo runs the provedone station, the `Verified-by:` receipt rule, and denies in about half a second with the fix (the valid scopes, "add `Verified-by: <command> -> exit 0`", the 100-character footer limit). Before, the same failures came from `commit-msg` only after the multi-minute `pre-commit` had run. A repo with no commitlint config or install, a commit that opens the editor, and any internal error get no opinion. Re-run `hookset init --claude` to vendor the new copy.

- [#1868](https://github.com/ofri-peretz/burgee/pull/1868) [`a10c24d`](https://github.com/ofri-peretz/burgee/commit/a10c24d79a7f4bfe08f7c240b7010cb0ab676d13) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The Claude pack gains `worktree-sweep.mjs`, a SessionStart hook that runs the repo's own `hookset worktrees --prune` in the background at most once a day per clone, so the worktrees agents leave behind are cleaned up without anyone asking. It removes only worktrees that hold no work. `HOOKSET_WORKTREES=0` turns it off, `HOOKSET_WORKTREES_OLDER_THAN=<days>` sets the age, and `git worktree lock` keeps a worktree out of every sweep. `hookset check` now wants it vendored and wired like the rest of the pack; `hookset init --claude` does both.

- [#1862](https://github.com/ofri-peretz/burgee/pull/1862) [`e966499`](https://github.com/ofri-peretz/burgee/commit/e966499fcf2368e4cb2a1c39a09df938380be8f8) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `hookset worktrees` lists every linked git worktree of a clone (the ones Claude Code's `--worktree`, subagent isolation and other agents leave behind), with `--size` its size on disk, and why each stays. `--prune` removes only those that hold no work: not the main or current one, not locked, an empty `git status`, every commit on a remote, and unchanged for `--older-than` days (default 3), through `git worktree remove` without `--force`, then `git worktree prune`. Branches are kept. `--include-local-commits` lets a commit that is only on this machine go too, and `git worktree lock` keeps a worktree out of every sweep.

### Patch Changes

- [#1859](https://github.com/ofri-peretz/burgee/pull/1859) [`0123ec6`](https://github.com/ofri-peretz/burgee/commit/0123ec663d1984f03ba442700963571e6bfac6ef) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The codegraph hook indexes `.` from the repo folder instead of passing the folder path, so on Windows, where npx runs through a shell, a path with a space in it no longer splits.
- Updated dependencies [[`54403b9`](https://github.com/ofri-peretz/burgee/commit/54403b91c6a023db0c354c206e6d1c6c5bb40796), [`02f3ce0`](https://github.com/ofri-peretz/burgee/commit/02f3ce03b0075db5e0e99b991ad767dd2b396ccb)]:
  - burgee@2.2.3

## 1.2.0

### Minor Changes

- [#1849](https://github.com/ofri-peretz/burgee/pull/1849) [`cc5c7ad`](https://github.com/ofri-peretz/burgee/commit/cc5c7ad1581d0f224b01274f97a52e0131d7e6b8) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The Claude pack runs the CodeGraph MCP server, so Claude answers "where is it, what calls it, how does A reach B" from a prebuilt symbol graph instead of a grep-and-read loop. `hookset init --claude` adds it to `.mcp.json` at a pinned version, lists `.codegraph/` in `.gitignore`, enables it in settings.json, and vendors `codegraph.mjs`, a SessionStart hook that builds the index in the background. `hookset check` fails when any of those is missing or drifted. Measured on burgee (`packages/hookset/scripts/codegraph-bench`): on flow-tracing tasks greps fell from 29 to 18 and file reads from 24 to 3.

  `hookset context` now counts what an MCP server in `.mcp.json` loads into every session: a pack server at the size `stations.json` records (codegraph: 8,652 characters, about 2,163 tokens), and names any other server as not measured. A repo that adopts the server raises its ceiling once to include it.

## 1.1.1

### Patch Changes

- [#1845](https://github.com/ofri-peretz/burgee/pull/1845) [`2ce60be`](https://github.com/ofri-peretz/burgee/commit/2ce60be944df04598293801c08f4de78fea2d619) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `verify-before-stop`'s `recordPass` takes the test run as one `{ command, failed }` argument, so the vendored hook passes a consumer's `max-params` lint at four parameters (serverless's eslint flagged five).

- [#1845](https://github.com/ofri-peretz/burgee/pull/1845) [`2ce60be`](https://github.com/ofri-peretz/burgee/commit/2ce60be944df04598293801c08f4de78fea2d619) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `verify-before-stop` records a pass only from a run that proves one: a foreground test command that runs last, with no `|`, `||`, `;` or `&` that could hide its failure or edit code after it (`npm test || true`, `npx vitest run | tail` and `npm test && sed -i … a.ts` no longer count). It reads `git status` from the work-tree root, so a hook whose cwd is a package still fingerprints the right files, and a code file renamed to a doc still counts as a code change.

  The `triggerlist-review` action that ships with this tag keeps `coderabbitai[bot]`'s comments out of the reviewer's prompt by default (`exclude-comments-by-actor`), as eslint's own review step did.

## 1.1.0

### Minor Changes

- [#1835](https://github.com/ofri-peretz/burgee/pull/1835) [`ff3dbe4`](https://github.com/ofri-peretz/burgee/commit/ff3dbe4cada0c732871538de416ed31e3f4b73ef) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `hookset context` measures the always-loaded Claude Code context (CLAUDE.md and its `@`-imports, plus every model-invocable skill, command and subagent description) and fails when it is over the ceiling in `.claude/hookset.json`. `--update` lowers the ceiling to the current size and refuses to raise it.

- [#1834](https://github.com/ofri-peretz/burgee/pull/1834) [`48e660c`](https://github.com/ofri-peretz/burgee/commit/48e660c4202b1ef0ac5158398eb7a7b8610bbcc6) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The reusable `hookset-check.yml` workflow gains a `provedone receipts` job on pull requests: it runs `provedone gate --mode enforce` on every non-merge commit, so a commit that skipped the `commit-msg` hook (the web editor, a bypassed hook) fails CI without its `Verified-by:` receipt. The Version PR and bot-opened PRs are exempt.

- [#1836](https://github.com/ofri-peretz/burgee/pull/1836) [`eaf51bc`](https://github.com/ofri-peretz/burgee/commit/eaf51bc219a93b1fa23a40960068b5dcf911ae2f) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The Claude pack gains `verify-before-stop` and a `verify` skill. `verify-before-stop` (PostToolUse and Stop) sends a turn back once when it ends on uncommitted code that no passing test run has covered; docs and the `verifyIgnore` globs in `.claude/hookset.json` do not count, and the second stop of a turn always ends it. `init --claude` writes `.claude/skills/verify/SKILL.md` from a template once, and `check` fails while it is missing, keeps a `TODO(verify)` line, or loses `name: verify` or `## Feature map`. Upgrading: run `hookset init --claude`, then fill in the skill.

## 1.0.1

### Patch Changes

- [#1824](https://github.com/ofri-peretz/burgee/pull/1824) [`fba06fa`](https://github.com/ofri-peretz/burgee/commit/fba06fac4a959f1e5abd4072c4febd4379d4db95) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The commit-msg preset's commitlint failure no longer claims the scope is wrong. It points at commitlint's own ✖ lines, which name the rule that failed: a footer line over 100 characters used to read as a scope error.

- [#1814](https://github.com/ofri-peretz/burgee/pull/1814) [`06089bd`](https://github.com/ofri-peretz/burgee/commit/06089bd8a1cdee49927e49a508e36ae7fa57ae78) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - hookset's docs have a site of their own at https://hookset.interlace.tools: guides to the presets, the two commands, pinning, the Claude Code hooks and generated files, a husky migration page and recipes. The package's `homepage` and its README's Docs line point there.

- [#1816](https://github.com/ofri-peretz/burgee/pull/1816) [`e3d4ded`](https://github.com/ofri-peretz/burgee/commit/e3d4dedb66e5204327221bacac301aeb9fb1a180) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The vendored `guard-bash.mjs` now passes the strict lint of the repos that vendor it: `globToRegExp` is one table-driven replace (cognitive complexity 16 to under 15), a redirect check uses `startsWith`, and a comment no longer reads as commented-out code.

- [#1813](https://github.com/ofri-peretz/burgee/pull/1813) [`4821145`](https://github.com/ofri-peretz/burgee/commit/482114557947f01bc8df543daf317dada2664c21) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `hookset init` re-pins only the hookset remote's `ref:`; a repo that lists another remote first keeps that remote's pin. `hookset check` heads a failing result with every problem it lists, by severity (`hookset: 1 error, 2 warnings`), where it counted only the errors as `N problem(s)`.
- Updated dependencies [[`4821145`](https://github.com/ofri-peretz/burgee/commit/482114557947f01bc8df543daf317dada2664c21)]:
  - burgee@2.2.2

## 1.0.0

### Major Changes

- [#1808](https://github.com/ofri-peretz/burgee/pull/1808) [`068c76b`](https://github.com/ofri-peretz/burgee/commit/068c76b1ecdc5b667b36c40bed25bb5daa54026d) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - hookset is 1.0. Its `.` entry, the `hookset` bin with `init` and `check`, their `--json` shape and exit codes, the lefthook presets (`commit-msg`, `pre-commit`, `pre-push`) and the steps each one runs, the Claude pack (`guard-bash`, `stop-after-3`) and the `.claude/hookset.json` fields it reads are now a semver contract: a station is removed, or a preset step starts failing where it passed, only in a 2.0. This also moves hookset past the 0.3.0 that npm will not take again. The evidence is D-20261124-hookset-triggerlist-1-0: 100% coverage, every spec row built, and a first full mutation run with no surviving mutant.

### Minor Changes

- [#1801](https://github.com/ofri-peretz/burgee/pull/1801) [`d2ec721`](https://github.com/ofri-peretz/burgee/commit/d2ec721a56e52455f1fc46cddd86fec2abb09dba) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - guard-bash denies Edit/Write on a generated file listed under `generated` in `.claude/hookset.json` (glob to the command that writes it) and names that command, so a repo drops its "regenerate, don't hand-edit" prose.

- [#1805](https://github.com/ofri-peretz/burgee/pull/1805) [`0ad24f0`](https://github.com/ofri-peretz/burgee/commit/0ad24f0e554915958ce8e66243a67cf75cd67832) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A new enforced `commit-msg` station, `hookset-provedone`, runs `npm run hook:provedone -- {1}`: a commit with no `Verified-by:` receipt fails. `hookset check` reports a repo that does not declare `hook:provedone`. Declare it as `"hook:provedone": "provedone gate --mode enforce"` with `provedone` as a devDependency.

### Patch Changes

- [#1802](https://github.com/ofri-peretz/burgee/pull/1802) [`a2f44f4`](https://github.com/ofri-peretz/burgee/commit/a2f44f4113df9db4b0061852e36a3c36e0099035) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - guard-bash closes hook-skip and publish bypasses: `--no-veri` (git takes abbreviated options), `export LEFTHOOK=0` before the commit, `lefthook uninstall` and `rm`/`mv`/`chmod` on `.git/hooks`, `GIT_CONFIG_KEY_n=core.hooksPath`, `for`/`watch` CI polling, and yarn/bun publish, `unpublish`, `deprecate`, `dist-tag add|rm`, `lerna publish`, `/usr/bin/npm publish`. It now asks before a force push, `+ref`, `--delete`, `:ref`, `--mirror` or `--prune`.

- [#1800](https://github.com/ofri-peretz/burgee/pull/1800) [`2311f8b`](https://github.com/ofri-peretz/burgee/commit/2311f8be03bd64991847e4755963f55ecf9218f5) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Ships the 0.3.0 release as 0.3.1. npm refuses 0.3.0 for `hookset` because an earlier package under that name published and then removed it, and npm never lets a removed version number be used again.

## 0.3.0

### Minor Changes

- [#1796](https://github.com/ofri-peretz/burgee/pull/1796) [`be786b0`](https://github.com/ofri-peretz/burgee/commit/be786b0a4f8c3af04f52fc08b88cdd807c347a34) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - First npm releases. `hookset` ships the verification stations as lefthook presets and a Claude Code hook pack; `triggerlist` hands a reviewer only the checklist items a diff fires.

### Patch Changes

- [#1794](https://github.com/ofri-peretz/burgee/pull/1794) [`3e107e3`](https://github.com/ofri-peretz/burgee/commit/3e107e351f79f2a0a721811fb6a540b5dcfdbd6a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - guard-bash asks before `pnpm -F pkg publish`: a single-dash option can take the next word as its value, the same as `--filter pkg`, so the publish after it is found.

## 0.2.2

### Patch Changes

- [#1790](https://github.com/ofri-peretz/burgee/pull/1790) [`40903e7`](https://github.com/ofri-peretz/burgee/commit/40903e74a35b0c111d5a672416249034f5cabd46) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - guard-bash: `git push --dry-run` still needs the long timeout (it runs pre-push; only `git commit --dry-run` skips hooks), `npm`/`pnpm` options before `publish` still ask a person, and dot segments in an edited path cannot step around a frozen glob. stop-after-3: an interrupted test run keeps the failure count instead of resetting it.

## 0.2.1

### Patch Changes

- [#1777](https://github.com/ofri-peretz/burgee/pull/1777) [`1c6440d`](https://github.com/ofri-peretz/burgee/commit/1c6440d69333af060a46826f71e74625ff17ca05) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - guard-bash gives a command a repo lists under `ask` in `.claude/hookset.json` its own reason (rule id `repo-ask`) instead of the publish message, so a listed `-- --force` sync is not described as a release.

## 0.2.0

### Minor Changes

- [#1774](https://github.com/ofri-peretz/burgee/pull/1774) [`70f4252`](https://github.com/ofri-peretz/burgee/commit/70f425240bf3ee3e1030f50e66acd12e39b35b87) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - guard-bash denies a foreground `git commit` or `git push` under a 5-minute timeout: their hooks are the repo's gate and outlive Claude Code's default 2 minutes. The denial names the fix (`timeout: 600000` or `run_in_background: true`), so a repo's CLAUDE.md no longer has to say "not a hang".
