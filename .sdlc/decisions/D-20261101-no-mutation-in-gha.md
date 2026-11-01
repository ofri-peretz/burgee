---
id: D-20261101-no-mutation-in-gha
subject: 'No mutation run in GitHub Actions: the per-PR changed-lines lane is pre-push only, the weekly full run is local and lands its ratchet PR the same way, and oxmutate''s SC8 and SC11 read from those local runs'
taken: 'Taken — the owner''s ruling of 2026-11-01'
date: '2026-11-01'
superseded_by: —
---

**The owner, 2026-11-01:** "No oxmutate in GHA", and "We are running it locally and post PRs".

**What left GitHub Actions.** Every step that mutated:

| was | ran | now |
| --- | --- | --- |
| `quality-full.yml` → `Mutation (changed lines)` | `npm run mutation:changed` on every non-draft PR, push to `main` and queue entry; a `needs` edge and a summary row in `Quality (Full) Gate` | pre-push only (`lefthook.yml` → `mutation-changed`, priority 3, after the battery and the root suite) |
| `mutation.yml` | every package in full, Saturday 02:30 UTC, a 12-cell matrix, then `record` and a ratchet PR | `npm run mutation:weekly` (`scripts/mutation-weekly.sh`), started by launchd Saturday 02:30 local time (`tools/launchd/dev.burgee.mutation-weekly.plist`) |
| `oxmutate-bench.yml` | Stryker beside oxmutate per package, on dispatch | `npx tsx packages/oxmutate/bench/burgee-pair.mts --package <pkg>` on the owner's machine |
| `compat.yml` → `heavy-tests` (added by #1424), reported by `nightly-report.yml` | the NIGHTLY_ONLY test cases, oxmutate end to end, with `BURGEE_NIGHTLY=1`, nightly | `npm run mutation:weekly`, before the full runs; a red one exits 1 and opens or updates "Weekly nightly-only test cases failed" ([D-20261101-tests-under-5s](./D-20261101-tests-under-5s.md), amended) |

`Mutation (changed lines)` was never a required check (`main`'s nine, read on 2026-11-01 with
`gh api repos/ofri-peretz/burgee/branches/main/protection/required_status_checks`), so branch
protection needs no change. Kept, because neither is a mutation run: `oxmutate-native.yml`, which
builds the six native cores a release of oxmutate bundles, and `quality-full.yml` → `test`, which
builds oxmutate's core and runs oxmutate's own unit suite.

## Consequences

- **The per-PR mutation gate is pre-push only.** A branch pushed with the hook skipped, or from a
  machine without cargo, is not mutated before it merges. `--no-verify` is already forbidden in
  this repository; the hook says `fix:` when cargo is missing. A PR's checks no longer show a
  mutation verdict; the push that opened it carried one.
- **The weekly full run is local, and lands its PR the same way.** `scripts/mutation-weekly.sh` does
  what `mutation.yml` did, one package after another instead of three cells at a time: a clean
  detached worktree of `origin/main`; build; oxmutate's native core; each package in
  `.sdlc/bands/mutation-ratchets.json`, after the 5-minute load is below 50 and more than 15 GB of
  disk is free, at concurrency 2, with that package's temp dirs removed after it; `record`; then,
  when the ratchets moved, a `chore/mutation-ratchets-YYYYMMDD` branch pushed over HTTPS with the
  hooks on, a PR titled as the workflow titled it, labelled `skip-changeset`, with auto-merge armed
  unless the PR is held. It exits 2 on a breached floor, as the workflow failed on one. The PR is
  opened by the owner's `gh`, so it raises its checks — the `GITHUB_TOKEN` gap the workflow had to
  work around (`.sdlc/gaps/C5.md`) does not apply.
- **oxmutate's `SC8` is measured locally, both engines on the same machine.** `SC8` asked for a full
  burgee run in ≤ 30 minutes "on the CI runner". There is no CI run now. The run that answers it
  is the weekly local run, and the comparison is Stryker and oxmutate on the same machine, back to
  back (`burgee-pair.mts`, or `--engine stryker` against the default), recorded with the machine
  spec and the load average during the run. That is fairer than the runner it replaces: both
  engines meet the same hardware and the same neighbours, like for like. The absolute 30-minute
  bar is read on this machine and says so; `metrics.md` rule 1's "a number from anywhere else is
  not published" now means a number not produced by the paired script on one machine.
- **`SC11`'s "one green week" reads from the local runs.** The week starts at the first green
  local weekly full run under oxmutate (`npm run mutation:weekly`, its ratchet PR merged) and
  closes seven days later if every oxmutate run on `main` in that window is green: the weekly run,
  and the pre-push changed-lines run of every PR merged to `main` in the window. A red run restarts
  the week, as in [`D-20261101-oxmutate-s3-fixture-sc11-week`](./D-20261101-oxmutate-s3-fixture-sc11-week.md).
- **Two decisions are amended, not superseded.** [`D-20261101-heavy-ci-runs-nightly`](./D-20261101-heavy-ci-runs-nightly.md)
  stands for bench, compat and evals; only its `mutation.yml` row and schedule line change.
  `D-20261101-oxmutate-s3-fixture-sc11-week` stands for `S3`; only where `SC11` reads changes.
  Each carries an amendment paragraph naming this decision.

## What could go wrong, and what catches it

- **The Mac is asleep or off on Saturday.** launchd runs a missed calendar start at the next wake;
  `caffeinate -i` keeps it awake for the run. A week with no run leaves the ratchets with no new
  observation, which the next run's PR shows by its date.
- **Load or disk never clears.** Each package waits at most 360 minutes (`MUTATION_WAIT_MAX_MINUTES`),
  then is logged `NOT RUN` and the script exits 1; nothing is dropped silently.
- **A workflow mutates again.** `scripts/mutation-local-only-lock.test.ts` reads every `run:` step
  under `.github/` and fails on `scripts/mutation.ts`, `mutation:changed`, `mutation:weekly`, their
  shell files, the oxmutate bin in command position, the paired bench or `stryker run`, and any workflow that sets `BURGEE_NIGHTLY` or runs vitest in `packages/oxmutate`; it is proven
  on the commands the removed jobs ran. It also holds the weekly script to every step above, in
  order, its dry run to every package in the ratchets, and the plist to Saturday 02:30 with Node
  24 on PATH.

## Rejected

- **Keeping the changed-lines job, informational.** It is still a mutation run in GitHub Actions,
  the thing the ruling removes, and on the 2026-10-29 weekly run oxmutate's engine time on
  compat-oracle was 203 minutes: the runner minutes are what the ruling saves.
- **A self-hosted runner on the owner's machine.** It would keep the workflows and move their
  compute, but it keeps GitHub Actions in the loop and puts a public repository's pull-request jobs
  on a personal machine.
