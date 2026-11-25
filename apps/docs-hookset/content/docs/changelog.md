---
title: Changelog
description: "Every release of hookset, newest first, from its CHANGELOG.md — what changed and the pull request it came from."
---

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
