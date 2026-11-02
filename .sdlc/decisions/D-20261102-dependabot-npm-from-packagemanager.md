---
id: D-20261102-dependabot-npm-from-packagemanager
subject: 'Every Dependabot all-packages PR (#1416, #1438) arrives with the @emnapi entries pruned from package-lock.json and fails CI. Repair each PR with a workflow, or stop the prune?'
taken: Taken
date: '2026-11-02'
superseded_by: —
---

**Stop the prune: `packageManager` names `npm@11.16.0`, the npm `changeset:version` already
writes the lock with, and a lock in `lockfile-lock.test.ts` holds both writers at or above it.
`scripts/lockfile-repair.ts` replaces the hand repair for any lock that still arrives pruned.
No workflow commits to Dependabot's branches.**

## What was measured

Dependabot's own job log (run 41420843729, the one that opened #1438) shows where its npm
comes from:

```
Found "packageManager" : "npm@11.6.2". Skipped checking "engines".
corepack install npm@11.6.2 --global --cache-only
corepack npm@11.6.2 install three@0.187.0 --workspace=apps/docs --force --ignore-scripts --package-lock-only
```

Corepack fetched `npm-11.6.2.tgz` from the registry even with `--cache-only`, so whatever
version the field names is the version that writes the lock. 11.6.2 is the npm
`lockfile-lock.test.ts` already names as the one that prunes.

Replaying that last command against main's manifests and lock:

| npm | `@emnapi/core`, `@emnapi/runtime` | `lockfile-resolves.ts` | Result |
| :-- | :-- | :-- | :-- |
| 11.6.2 | missing | exit 1, the three errors #1438's CI printed | **byte-identical** to #1438's lock |
| 11.16.0 | 1.11.3 | exit 0 | main's lock plus the two `three` hunks: **byte-identical** to #1441's hand repair |

The next group PR, #1442 (posthog-js 1.442.1 → 1.443.0 in `apps/docs-chassis`), failed the
same seven checks. The same replay with 11.6.2 is byte-identical to its lock. With 11.16.0 both
entries stay and `lockfile-resolves.ts` passes.

## The options

- **A workflow that repairs the PR** (`pull_request` from `dependabot[bot]`, commit the
  restored entries back). Dependabot's `pull_request` runs get a read-only token and no
  repository secrets, and this repo has no Dependabot secrets, so it could not push. It would
  have to be `pull_request_target` with `RELEASE_BOT_PAT`, a write credential in a job
  triggered by a bot's branch. The repair commit then also costs three things. Dependabot
  stops rebasing a PR once someone else commits to it, so a stale group PR is never refreshed.
  `dependabot/fetch-metadata` refuses a PR with a commit Dependabot did not make, so
  `dependabot-automerge.yml` fails on the `synchronize` it raises. And the PR's CI runs twice.
  It treats the symptom on every PR, forever.
- **The Dependabot config.** `dependabot.yml` has no setting for the npm version or for
  pruning. The version comes from `packageManager` alone, as the log shows. **Taken.**
- **Pin npm in `packageManager` to 11.16.0.** It removes the cause. Nothing runs, nothing
  commits, and no credential is involved. The cost is that `packageManager` no longer matches
  the npm Node 24 bundles (11.6.2). Nothing reads it but corepack: CI and local installs use
  Node 24's own npm, and `npm ci` with 11.6.2 accepts a lock 11.16.0 wrote (main's lock is one).

## What still guards it

- `lockfile-resolves.ts` in `Lockfile Sync` still refuses a pruned lock from any writer, for
  example an `npm install` on Node 24 by a person.
- `npx tsx scripts/lockfile-repair.ts` restores every entry it reports, copied
  from `origin/main`'s lock and spliced in at npm's sort position. It is a one-command repair
  for the PRs that still need one.

**Revisit:** when the Node version `.nvmrc` pins ships npm 11.16 or later, set
`packageManager` back to that bundled npm. If Dependabot ever stops honouring `packageManager`,
a pruned group PR will fail `Lockfile Sync` again, and the floor lock will not catch it. The
repair workflow is the fallback then, with the costs above.
