#!/usr/bin/env bash
# The changed-lines mutation lane (.sdlc/intents/mutation-tested/, R1–R4), as one script.
#
# Pre-push runs it, through `npm run mutation:changed`: the per-PR mutation gate. It was also
# CI's `Mutation (changed lines)` job until the owner ruled "No oxmutate in GHA"
# (D-20261101-no-mutation-in-gha); no workflow runs it now. `mutation-changed-lock.test.ts` holds
# package.json and lefthook.yml to this one file, and every workflow away from it.
#
# The sequence:
#   1. `mutation.ts changed --plan` decides whether any package source line changed; when none
#      did, the lane ends here, successfully, having built nothing.
#   2. Every package is built (a suite may read a sibling's dist), then oxmutate's native core,
#      which is Rust and which no `build` produces.
#   3. `mutation.ts changed` mutates those lines and fails on a mutant no test detects.
#
# Environment — unset in pre-push; set MUTATION_EVENT to run the lane as that event would:
#   MUTATION_EVENT        the GitHub event the diff stands for. Unset: `pull_request`, the event a
#                         pushed branch becomes, after `git fetch origin main`.
#   MUTATION_BASE         what the diff is taken against. Unset: `origin/main`.
#   MUTATION_CONCURRENCY  mutants at once. With MUTATION_EVENT set it is used as given; unset, it
#                         defaults to 2 and is capped at the cores the load average leaves free,
#                         never below 1.
#   GITHUB_STEP_SUMMARY   when set, the report is appended there too.
#
# Bash 3.2 (macOS /bin/bash): no mapfile, no associative arrays, no empty "${a[@]}" under set -u.
set -euo pipefail
# pre-push exports GIT_DIR (inside .git/worktrees/ from a worktree). Package suites run here through
# oxmutate, not turbo's strict env, so a test's `git init` would inherit it and set core.bare = true
# on the shared repository (2026-11-01). Git finds the repository from the working directory.
for name in $(compgen -e | grep '^GIT_' || true); do unset "$name"; done
cd "$(dirname "$0")/.."

if [ -z "${MUTATION_EVENT+set}" ]; then
  git fetch --quiet origin main
  event=pull_request
  base=origin/main
  wanted=${MUTATION_CONCURRENCY:-2}
  concurrency=$(node -e '
    const os = require("node:os");
    const free = Math.floor(os.availableParallelism() - os.loadavg()[0]);
    process.stdout.write(String(Math.max(1, Math.min(Number(process.argv[1]), free))));
  ' "$wanted")
  echo "mutation:changed: against $base, $concurrency mutant(s) at once (asked for $wanted)."
else
  event=$MUTATION_EVENT
  base=${MUTATION_BASE-}
  concurrency=${MUTATION_CONCURRENCY:-2}
fi

plan=$(npx tsx scripts/mutation.ts changed --event "$event" --base "$base" --plan)
echo "$plan"
# The plan's last line is the mutate specs, a non-empty JSON object, only when there is work.
if ! tail -n 1 <<<"$plan" | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    try { const p = JSON.parse(s); process.exit(p && typeof p === "object" && !Array.isArray(p) && Object.keys(p).length > 0 ? 0 : 1); }
    catch { process.exit(1); }
  });'; then
  exit 0
fi

npx turbo run build --filter='./packages/*' --concurrency="$concurrency"

if ! command -v cargo >/dev/null 2>&1; then
  echo "mutation:changed: oxmutate's native core is Rust, and cargo is not on PATH, so the changed lines cannot be mutated." >&2
  echo "fix: install rustup (curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh), open a new shell, and run npm run mutation:changed again." >&2
  exit 1
fi
(cd packages/oxmutate && npm run build:native)

npx tsx scripts/mutation.ts changed --event "$event" --base "$base" --concurrency "$concurrency" ${GITHUB_STEP_SUMMARY:+--summary "$GITHUB_STEP_SUMMARY"}
