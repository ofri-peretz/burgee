#!/usr/bin/env bash
# The weekly full mutation run (.sdlc/intents/mutation-tested/, R5–R7), on the owner's machine.
#
# Until 2026-11-01 this was `.github/workflows/mutation.yml`. The owner ruled "No oxmutate in
# GHA" and "We are running it locally and post PRs" (D-20261101-no-mutation-in-gha), so this
# script does what that workflow did, one package after another, and lands the same PR:
#
#   1. fetch origin main, and put a dedicated worktree (default ../burgee-mutation-weekly, beside
#      this checkout) on a clean, detached origin/main — creating it when it is missing;
#   2. install when package-lock.json changed since the worktree's last install, build every
#      package (a suite may read a sibling's dist), then oxmutate's Rust core; then run the test
#      cases too heavy for a pull request (NIGHTLY_ONLY: oxmutate end to end, BURGEE_NIGHTLY=1),
#      which compat.yml's `heavy-tests` job ran until no mutation ran in GitHub Actions;
#   3. for each package in .sdlc/bands/mutation-ratchets.json: wait until the 5-minute load
#      average is below 50 and more than 15 GB of disk is free, run `mutation.ts full` on it, then
#      remove that package's temp dirs (its own TMPDIR, `.oxmutate-tmp`, `.stryker-tmp`);
#   4. `mutation.ts record`: appends each observation and raises any floor the run beat;
#   5. when the ratchets changed: branch `chore/mutation-ratchets-YYYYMMDD`, commit, push over
#      HTTPS with the hooks on, open the PR (label skip-changeset) and arm auto-merge, unless the
#      PR carries hold, do-not-merge or wip;
#   6. exit 2 on a breached floor (the PR still lands the observation), 1 when a package could
#      not be run, a nightly-only case failed or the PR could not land, 0 otherwise.
#
# Everything is appended to ~/Library/Logs/burgee-mutation-weekly.log. Each package's result
# file is kept under ~/Library/Logs/burgee-mutation-weekly/<UTC date>/, as the workflow kept its
# artifacts.
#
# Usage:
#   npm run mutation:weekly [-- --dry-run] [-- --worktree <path>] [-- --package <pkg>] [-- --engine oxmutate|stryker]
#
#   --dry-run          print every step it would take, with the packages it would measure, and
#                      change nothing: no fetch, no worktree, no build, no wait, no push
#   --worktree <path>  where the clean checkout of origin/main lives (or MUTATION_WEEKLY_WORKTREE)
#   --package <pkg>    measure only this package (the workflow's dispatch input)
#   --engine <name>    oxmutate (the default, and the schedule's) or stryker (kept to compare)
#
# Environment:
#   MUTATION_CONCURRENCY        mutants at once per package (default 2)
#   MUTATION_LOAD_MAX           wait while the 5-minute load average is at or above this (50)
#   MUTATION_DISK_MIN_GB        wait while this many GB or fewer are free (15)
#   MUTATION_WAIT_MAX_MINUTES   give a package up as not run after waiting this long (360)
#   MUTATION_WEEKLY_LOG         the log file
#   MUTATION_WEEKLY_RESULTS     where result files are kept
#
# Scheduled by launchd, Saturday 02:30 local time (a Mac asleep then runs it when it wakes):
#
#   cp tools/launchd/dev.burgee.mutation-weekly.plist ~/Library/LaunchAgents/
#   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/dev.burgee.mutation-weekly.plist
#
# To run it now: `launchctl kickstart gui/$(id -u)/dev.burgee.mutation-weekly`. To remove it:
# `launchctl bootout gui/$(id -u)/dev.burgee.mutation-weekly`. `mutation-local-only-lock.test.ts`
# holds this script to the steps above, and the plist to its schedule.
#
# Bash 3.2 (macOS /bin/bash): no mapfile, no associative arrays, no empty "${a[@]}" under set -u.
set -euo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
RATCHETS=.sdlc/bands/mutation-ratchets.json
PUSH_URL=https://github.com/ofri-peretz/burgee.git
TRAILER='Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'

DRY=0
worktree=${MUTATION_WEEKLY_WORKTREE:-}
only=''
engine=${MUTATION_ENGINE:-oxmutate}
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --worktree) worktree=${2:?--worktree needs a path}; shift ;;
    --package) only=${2:?--package needs a package}; shift ;;
    --engine) engine=${2:?--engine needs oxmutate or stryker}; shift ;;
    -h | --help) grep '^#' "$0" | sed -e '1d' -e 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "mutation:weekly: unknown argument $1 (see --help)" >&2; exit 2 ;;
  esac
  shift
done
case "$engine" in oxmutate | stryker) ;; *) echo "mutation:weekly: --engine is oxmutate or stryker, not $engine" >&2; exit 2 ;; esac

WORKTREE=${worktree:-$(dirname "$REPO")/burgee-mutation-weekly}
LOG=${MUTATION_WEEKLY_LOG:-$HOME/Library/Logs/burgee-mutation-weekly.log}
LOAD_MAX=${MUTATION_LOAD_MAX:-50}
DISK_MIN_GB=${MUTATION_DISK_MIN_GB:-15}
WAIT_MAX_MINUTES=${MUTATION_WAIT_MAX_MINUTES:-360}
concurrency=${MUTATION_CONCURRENCY:-2}
stamp=$(date -u +%Y%m%d)
results=${MUTATION_WEEKLY_RESULTS:-$HOME/Library/Logs/burgee-mutation-weekly}/$stamp

mkdir -p "$(dirname "$LOG")"
exec > >(tee -a "$LOG") 2>&1

say() { echo "mutation:weekly: $*"; }
# Each step is printed, then run — or, in a dry run, only printed.
in_repo() { echo "+ $*"; [ "$DRY" = 1 ] || (cd "$REPO" && "$@"); }
in_wt() { echo "+ (in $WORKTREE) $*"; [ "$DRY" = 1 ] || (cd "$WORKTREE" && "$@"); }

load5() { sysctl -n vm.loadavg 2>/dev/null | awk '{print int($3)}' || awk '{print int($2)}' /proc/loadavg; }
free_gb() {
  local at=$WORKTREE
  [ -d "$at" ] || at=$(dirname "$WORKTREE")
  [ -d "$at" ] || at=$REPO
  df -Pk "$at" | awk 'NR==2 {print int($4/1048576)}'
}
# 0 when there is room; 1 when there still was none after MUTATION_WAIT_MAX_MINUTES.
wait_for_room() {
  local waited=0 l g
  while :; do
    l=$(load5)
    g=$(free_gb)
    if [ "$l" -lt "$LOAD_MAX" ] && [ "$g" -gt "$DISK_MIN_GB" ]; then return 0; fi
    if [ "$DRY" = 1 ]; then say "(dry run) would wait: load $l (below $LOAD_MAX wanted), $g GB free (over $DISK_MIN_GB wanted)"; return 0; fi
    if [ "$waited" -ge $((WAIT_MAX_MINUTES * 60)) ]; then return 1; fi
    if [ $((waited % 600)) -eq 0 ]; then say "waiting for room: load $l (below $LOAD_MAX wanted), $g GB free (over $DISK_MIN_GB wanted)"; fi
    sleep 60
    waited=$((waited + 60))
  done
}

say "$(date -u +%Y-%m-%dT%H:%M:%SZ) on $(hostname -s), engine $engine, concurrency $concurrency, worktree $WORKTREE$([ "$DRY" = 1 ] && echo ', DRY RUN')"
say "node $(node -v 2>/dev/null || echo 'not found'), load $(load5), $(free_gb) GB free"

if [ "$DRY" = 0 ]; then
  for tool in node npm git gh; do
    command -v "$tool" >/dev/null 2>&1 || { say "$tool is not on PATH." >&2; echo "fix: run from a shell where $tool resolves; the launchd plist sets PATH for node 24." >&2; exit 1; }
  done
  if ! command -v cargo >/dev/null 2>&1; then
    say "oxmutate's native core is Rust, and cargo is not on PATH." >&2
    echo "fix: install rustup (curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh), or add ~/.cargo/bin to the plist's PATH." >&2
    exit 1
  fi
  # One weekly run at a time; launchd never starts a second, a person might.
  LOCK="${TMPDIR:-/tmp}/burgee-mutation-weekly.lock"
  mkdir "$LOCK" 2>/dev/null || { say "another run holds $LOCK; remove it if that run is gone." >&2; exit 1; }
  trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT
fi

# 1. A clean checkout of origin/main.
in_repo git fetch --quiet origin main
if [ -d "$WORKTREE" ] || [ -f "$WORKTREE/.git" ]; then
  if [ "$DRY" = 0 ] && [ -n "$(cd "$WORKTREE" && git status --porcelain --untracked-files=no)" ]; then
    say "$WORKTREE has uncommitted changes to tracked files, left by an earlier run or by hand:" >&2
    (cd "$WORKTREE" && git status --short --untracked-files=no) >&2
    echo "fix: look at them, then \`git -C $WORKTREE checkout -- .\` and run npm run mutation:weekly again." >&2
    exit 1
  fi
  in_wt git fetch --quiet origin main
else
  in_repo git worktree add --detach "$WORKTREE" origin/main
fi
in_wt git switch --detach origin/main
# A dry run reads origin/main as this checkout last fetched it, and a checkout without that ref
# (Actions' detached one, which runs the locks) is no reason to fail a plan.
if [ "$DRY" = 1 ]; then
  commit=$(cd "$REPO" && git rev-parse --short origin/main 2>/dev/null || echo 'origin/main, not fetched here')
else
  commit=$(cd "$WORKTREE" && git rev-parse --short HEAD)
fi
say "measuring origin/main at ${commit:-unknown}"

# 2. Install (only when the lockfile moved), build every package, then oxmutate's native core.
lock_sum=$( (cd "$REPO" && shasum package-lock.json 2>/dev/null) | awk '{print $1}' || true)
[ "$DRY" = 1 ] || lock_sum=$( (cd "$WORKTREE" && shasum package-lock.json) | awk '{print $1}')
if [ "$DRY" = 1 ] || [ ! -d "$WORKTREE/node_modules" ] || [ "$(cat "$WORKTREE/node_modules/.mutation-weekly-lock" 2>/dev/null)" != "$lock_sum" ]; then
  in_wt npm ci --no-audit --no-fund
  [ "$DRY" = 1 ] || echo "$lock_sum" >"$WORKTREE/node_modules/.mutation-weekly-lock"
else
  say "package-lock.json unchanged since the last install; skipping npm ci"
fi
in_wt npx turbo run build --filter='./packages/*' --concurrency="$concurrency"
# The native core is built whatever the engine: the nightly-only cases below need it too.
in_wt npm run build:native -w oxmutate

# 2b. The test cases too heavy for a pull request: NIGHTLY_ONLY in
# scripts/vitest-case-budget-reporter.ts, each of which runs oxmutate end to end, so they run
# here and nowhere in GitHub Actions. `case-budget-lock.test.ts` holds this list to NIGHTLY_ONLY's
# files. A red one fails the run (exit 1) after the mutation runs and their PR still land.
nightly_rc=0
if [ -z "$only" ]; then
  wait_for_room || say "no room for the nightly-only cases after $WAIT_MAX_MINUTES minutes; running them anyway." >&2
  if ! in_wt env BURGEE_NIGHTLY=1 OXMUTATE_REQUIRE_NATIVE=1 npm exec -w oxmutate -- vitest run src/e2e.test.ts src/sensitivity.test.ts src/vitest5-regression.test.ts src/checker.test.ts; then
    nightly_rc=1
    say "the nightly-only test cases failed; see above." >&2
  fi
else
  say "--package $only: the nightly-only test cases are not run."
fi

# 3. Every package in the ratchets, one at a time.
packages=$( (cd "$([ "$DRY" = 1 ] && echo "$REPO" || echo "$WORKTREE")" && node -e 'process.stdout.write(Object.keys(require("./" + process.argv[1]).ratchets).join(" "))' "$RATCHETS"))
[ -n "$packages" ] || { say "no package in $RATCHETS" >&2; exit 1; }
if [ -n "$only" ] && ! echo " $packages " | grep -q " $only "; then say "--package $only is not in $RATCHETS ($packages)" >&2; exit 2; fi
[ "$DRY" = 1 ] || mkdir -p "$results"
say "packages: $packages; results in $results"

not_run=''
for pkg in $packages; do
  if [ -n "$only" ] && [ "$only" != "$pkg" ]; then say "--package $only: $pkg not measured."; continue; fi
  if ! wait_for_room; then
    say "$pkg NOT RUN: no room after $WAIT_MAX_MINUTES minutes (load $(load5), $(free_gb) GB free)." >&2
    not_run="$not_run $pkg"
    continue
  fi
  started=$(date +%s)
  pkg_tmp=$([ "$DRY" = 1 ] && echo "<a new temp dir>" || mktemp -d "${TMPDIR:-/tmp}/burgee-mutation-$pkg.XXXXXX")
  if in_wt env TMPDIR="$pkg_tmp" MUTATION_ENGINE="$engine" npx tsx scripts/mutation.ts full --package "$pkg" --concurrency "$concurrency" --out "$results/$pkg.json"; then
    :
  else
    say "$pkg: mutation.ts full exited $? (a measured package without a score; record reads it as a breach)." >&2
  fi
  if [ "$DRY" = 0 ] && [ ! -f "$results/$pkg.json" ]; then
    say "$pkg NOT RUN: mutation.ts full wrote no result file." >&2
    not_run="$not_run $pkg"
  fi
  if [ "$DRY" = 0 ]; then
    rm -rf "$pkg_tmp" "$WORKTREE/packages/$pkg/.oxmutate-tmp" "$WORKTREE/packages/$pkg/.stryker-tmp"
    say "$pkg done in $((($(date +%s) - started) / 60)) min; load $(load5), $(free_gb) GB free"
  fi
done

# 4. Fold the results into the ratchets.
record_rc=0
if [ "$DRY" = 1 ]; then
  in_wt npx tsx scripts/mutation.ts record --results "$results"
else
  set +e
  in_wt npx tsx scripts/mutation.ts record --results "$results" 2>&1 | tee "$results/record.log"
  record_rc=${PIPESTATUS[0]}
  set -e
fi

# 5. Land the observations, so the ratchet has a series.
land_rc=0
if [ "$DRY" = 1 ]; then
  say "(dry run) when $RATCHETS changed: commit it on chore/mutation-ratchets-$stamp, push it to $PUSH_URL with the hooks on, open the PR labelled skip-changeset, and arm squash auto-merge unless it is held"
elif [ -z "$(cd "$WORKTREE" && git status --porcelain "$RATCHETS")" ]; then
  say "Nothing new to record."
else
  branch="chore/mutation-ratchets-$stamp"
  if git ls-remote --exit-code --heads "$PUSH_URL" "$branch" >/dev/null 2>&1; then branch="$branch-$(date -u +%H%M)"; fi
  if [ "$record_rc" -ne 0 ]; then
    title="chore(workspace): record mutation scores — a floor was breached"
    body='A measured package scored below its mutation floor. The observation is recorded here; the floor is not lowered. Kill the new survivors, or record a decision in `.sdlc/decisions/` and cite it in a new history step.'
  else
    title="chore(workspace): record mutation scores"
    body='Weekly full mutation run (`npm run mutation:weekly`, on the owner'"'"'s machine since D-20261101-no-mutation-in-gha). Observations appended; any floor the run beat moves up with it. A series that stops updating looks perfectly healthy, which is why these landing is what keeps the ratchet honest.'
  fi
  body=$(printf '%s\n\nMeasured on origin/main at %s, engine %s, concurrency %s.%s\n\n```\n%s\n```\n' \
    "$body" "$commit" "$engine" "$concurrency" "$([ -n "$not_run" ] && echo " Not run:$not_run.")" "$(cat "$results/record.log")")
  in_wt git switch -c "$branch"
  in_wt git add "$RATCHETS"
  in_wt git commit -q -m "$title" -m "$TRAILER"
  pushed=0
  for attempt in 1 2 3 4 5; do
    # The pre-push battery runs here, as on any push. A push killed mid-way may still have landed.
    if in_wt git push "$PUSH_URL" "$branch:$branch"; then pushed=1; break; fi
    if [ "$(git ls-remote --heads "$PUSH_URL" "$branch" | awk '{print $1}')" = "$(cd "$WORKTREE" && git rev-parse HEAD)" ]; then pushed=1; break; fi
    say "push attempt $attempt failed; retrying in 60 s" >&2
    sleep 60
  done
  if [ "$pushed" = 0 ]; then
    say "could not push $branch; it is committed in $WORKTREE. Push it and open the PR by hand." >&2
    land_rc=1
  elif ! in_wt gh pr create --base main --head "$branch" --label skip-changeset --title "$title" --body "$body"; then
    say "gh pr create failed for $branch." >&2
    land_rc=1
  else
    # A held PR (hold, do-not-merge, wip) is left alone; labels that cannot be read count as held.
    held=$(cd "$WORKTREE" && gh pr view "$branch" --json labels --jq '[.labels[].name]|any(.=="hold" or .=="do-not-merge" or .=="wip")') || held=true
    if [ "$held" = true ]; then
      say "$branch is held (hold, do-not-merge or wip, or its labels could not be read); not arming auto-merge."
    elif ! in_wt gh pr merge --auto --squash "$branch"; then
      say "could not arm auto-merge on $branch; merge it by hand once green." >&2
    fi
  fi
  # Leave the worktree on origin/main, so the next run starts clean.
  in_wt git switch --detach origin/main
fi

# A red nightly-only case opens an issue, or comments on the open one, as nightly-report.yml did
# for compat.yml's `heavy-tests`.
if [ "$nightly_rc" -ne 0 ] && [ "$DRY" = 0 ]; then
  issue_title="Weekly nightly-only test cases failed"
  issue_body=$(printf 'The NIGHTLY_ONLY test cases (scripts/vitest-case-budget-reporter.ts), run with BURGEE_NIGHTLY=1 by `npm run mutation:weekly` on origin/main at %s, failed. They run oxmutate end to end, so no pull request runs them; this is where a broken end-to-end case shows. The log is ~/Library/Logs/burgee-mutation-weekly.log on the machine that ran it.\n' "$commit")
  existing=$(cd "$WORKTREE" && gh issue list --state open --search "$issue_title in:title" --json number --jq '.[0].number // empty') || existing=''
  if [ -n "$existing" ]; then
    (cd "$WORKTREE" && gh issue comment "$existing" --body "$issue_body") || say "could not comment on issue #$existing." >&2
  else
    (cd "$WORKTREE" && gh issue create --title "$issue_title" --body "$issue_body") || say "could not open the issue." >&2
  fi
fi

# 6. The verdict.
if [ "$record_rc" -ne 0 ]; then
  say "A measured package fell below its mutation floor, or produced no score. See record.log above." >&2
  exit 2
fi
if [ -n "$not_run" ] || [ "$land_rc" -ne 0 ] || [ "$nightly_rc" -ne 0 ]; then
  say "finished with failures:${not_run:+ not run:$not_run}$([ "$nightly_rc" -ne 0 ] && echo ' the nightly-only test cases failed;')$([ "$land_rc" -ne 0 ] && echo ' the PR did not land')" >&2
  exit 1
fi
say "done$([ "$DRY" = 1 ] && echo ' (dry run: nothing was changed)')."
