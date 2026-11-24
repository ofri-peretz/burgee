# hookset

The verification stations as git and Claude hooks, the same in every repository. Working name;
private until it has run in every Interlace repo. Intent: [`.sdlc/intents/hookset`](../../.sdlc/intents/hookset/intent.md).

## What it ships

- **Lefthook presets**, one file per hook under [`presets/lefthook/`](./presets/lefthook/), pulled
  through lefthook `remotes` at a pinned `hookset@<version>` tag. Each step calls the repo's own
  script by a declared name, so the preset is the same everywhere and the repo decides what runs:

  | Hook | Step | Repo script | Mode |
  | :-- | :-- | :-- | :-- |
  | commit-msg | `hookset-commitlint` | (commitlint config) | enforce |
  | pre-commit | `hookset-staged` | `hook:staged` (gets the staged paths; under 10 s) | enforce |
  | pre-push | `hookset-verify` | `hook:verify` (typecheck, affected tests, build) | enforce |
  | pre-push | `hookset-mutation` | `hook:mutation` | optional |
  | pre-push | `hookset-test-integrity`, `hookset-proofline`, `hookset-triggerlist` | `hook:<id>` | observe |

  Stations that are not enforced are wired with `npm run --if-present`, so a repo that has not
  declared one passes. The list is data: [`stations.json`](./stations.json).

- **A Claude hook pack** under [`claude/`](./claude/), vendored byte-identical into a repo's
  `.claude/hooks/`:
  - `guard-bash.mjs` (PreToolUse): denies skipping git hooks (`--no-verify` or an abbreviation
    git accepts, `git commit -n`, `LEFTHOOK=0`, `HUSKY=0`, also exported earlier in the command),
    moving `core.hooksPath` or removing the hooks (`lefthook uninstall`, `rm`/`mv`/`chmod` under
    `.git/hooks`), hand-rolled CI polling loops (`until`/`while`/`for` … `gh` … `sleep`, `watch gh`),
    and a foreground `git commit`/`git push` under a 5-minute timeout (their hooks outlive it); asks
    before a registry write (npm/pnpm/yarn/bun `publish`, `unpublish`, `deprecate`, `dist-tag add|rm`,
    `changeset publish`, `lerna publish`), a push that rewrites or deletes remote history (`--force`,
    `-f`, `+ref`, `--delete`, `:ref`, `--mirror`, `--prune`) and the commands the repo lists under
    `ask` in `.claude/hookset.json`; denies Edit/Write on the globs listed there under `frozen`.
  - `stop-after-3.mjs` (PostToolUse, PostToolUseFailure): counts failed test runs per session;
    a pass resets it, and the third failure in a row ends the turn with a stop-and-ask message.

- **`hookset init`** writes the smallest `lefthook.yml` that pulls the presets (`--force` adds them
  to a hand-written one, `--claude` vendors and wires the pack). **`hookset check`** exits 1 on a
  missing station script, an unpinned remote, a hand-written step that repeats a preset, or a
  vendored Claude hook that drifted. Both take `--json`.

## In another repo's CI

```yaml
jobs:
  hookset:
    uses: ofri-peretz/burgee/.github/workflows/hookset-check.yml@main
```

The workflow checks out `packages/hookset` at the tag the caller's `lefthook.yml` pins and runs
[`src/core.ts`](./src/core.ts) under Node's type stripping: no install, no build.

## Releasing a preset version

Bump `version` in `package.json`, merge, then tag the merge commit `hookset@<version>` (lefthook
`remotes` take a tag or a branch, never a commit). Repos move by changing `ref` (`hookset init`
does it); `hookset check` warns on a repo pinned behind.
