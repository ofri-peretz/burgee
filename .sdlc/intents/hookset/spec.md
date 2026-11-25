# Design — `hookset`

Intent: [`intent.md`](./intent.md). **Status:** draft.

---

## Requirements

- **R1** Preset files per station under `packages/hookset/presets/lefthook/*.yml`, each step
  calling a burgee-based CLI or a repo script by a declared name.
- **R2** `hookset init` writes `lefthook.yml` with `remotes` pointing at a tagged preset and a
  `local` override block; refuses to overwrite a hand-written file without `--force`.
- **R3** `hookset check` compares the repo's resolved hook steps to the pinned preset and to the
  station list; exit 1 on a missing station or an unpinned remote.
- **R4** Claude pack: a `PreToolUse` Bash hook that denies `--no-verify`, `-n` as a `git commit` flag
  only (never a bare `-n` token, which `git log -n` and `git diff -n` also use), `LEFTHOOK=0`, `HUSKY=0` and `core.hooksPath` changes; asks on `npm publish`, `changeset publish`
  and deploy commands from a repo-declared list; denies edits to repo-declared frozen globs.
- **R5** A `PostToolUse` hook that counts failed test commands per session in a temp file and, on
  the third, returns a message telling the agent to stop and ask.
- **R6** `--json` on every command; burgee `defineCommand` throughout.
- **R7** A `Stop` hook that sends a turn back once when it ends on uncommitted code no passing test
  run has covered (the verification post's "a hook that runs tests when Claude finishes"); docs
  and repo-listed `verifyIgnore` globs do not count, and the second stop of a turn always ends it.
- **R8** A `verify` skill every adopting repo carries (the post's verify skill and feature map):
  `init --claude` writes the template once, `check` fails while it is missing, unfilled, or has
  lost `name: verify` or `## Feature map`.

## Status

Read on 2026-11-24 for the 1.0 bar (D-170), recorded in
[`D-20261124-hookset-triggerlist-1-0`](../../decisions/D-20261124-hookset-triggerlist-1-0.md).

| R   | Status    | Where                                                                                   | Check                                                      |
| :-- | :-------- | :-------------------------------------------------------------------------------------- | :--------------------------------------------------------- |
| R1  | **Built** | `presets/lefthook/{commit-msg,pre-commit,pre-push}.yml`                                 | `core.test.ts` › `the package`                             |
| R2  | **Built** | `core.ts` (`initRepo`, `lefthookTemplate`), `cli.ts` (`init`, `--force`)                | `core.test.ts` › `initRepo`, `init, at its edges`          |
| R3  | **Built** | `core.ts` (`checkRepo`, `parseRemotes`, `localRuns`, `duplicateOf`), `cli.ts` (`check`) | `core.test.ts` › `checkRepo`, `the checks, at their edges` |
| R4  | **Built** | `claude/guard-bash.mjs` (plus generated-file edits, from `.claude/hookset.json`)        | `claude.test.ts` › `guard-bash`                            |
| R5  | **Built** | `claude/stop-after-3.mjs`                                                               | `claude.test.ts` › `stop-after-3`                          |
| R6  | **Built** | `cli.ts` (`defineCommand`, `--json` through burgee)                                     | `cli.test.ts` › `hookset`                                  |
| R7  | **Built** | `claude/verify-before-stop.mjs`                                                         | `claude.test.ts` › `verify-before-stop`                    |
| R8  | **Built** | `claude/skills/verify/SKILL.md`, `core.ts` (`checkSkill`)                               | `core.test.ts` › `checkRepo`                               |

**Built: 8. Not built: 0.**

## Design

- Station list is data (one JSON file), shared with provedone so the "Checked" line and the hooks
  name the same stations.
- The Claude hooks are small Node scripts shipped in the package and referenced by path from
  `.claude/settings.json`, so updating the package updates every repo.
- Order: R4 and R5 first (highest value, smallest), then R1–R3 on burgee, then blog and
  serverless.

## Verification

- `packages/hookset/src/*.test.ts`: each denied command pattern and each allowed near-miss, the
  three-failure counter, and `check` on fixture repos with planted drift.
- oxmutate through `mutation:changed`.

## Rejected alternatives

- **A shared `lefthook.yml` copied by the agents-repo baseline sync.** Copies drift; `remotes`
  with a pinned tag does not.
- **Enforcing stop-after-3 in CLAUDE.md only.** Not enforced; the playbook records the agent
  breaking a notes-only rule.

## Out of scope

- CI workflows. Those are the reusable `workflow_call` set.
- The checks themselves; hookset only wires them.
