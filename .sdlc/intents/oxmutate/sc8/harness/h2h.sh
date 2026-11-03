#!/bin/bash
# SC8 head-to-head, the owner's way: one quiet machine, engines alternating on one package.
# usage: h2h.sh <label:engine:pkg[:compat|:raw]>...
#   engine stryker  -> scripts/mutation.ts full --engine stryker (the lane's own method)
#   engine oxmutate -> prof.mjs on the lane's mutate list; `compat` = strykerCompat (Stryker's mutant set)
#   `raw` on a stryker compat-oracle run swaps in main's hosts.ts (Stryker's set as it runs by default)
# Each run waits for: 1-min load < 15, no other test runner on the machine, > 15 GB free.
# Records load every 60 s while it runs; cleans its temp dirs afterwards, killed or not.
set -u
W=/Users/ofri/repos/ofriperetz.dev/burgee/.claude/worktrees/agent-ae33ee366283a580a
S=/private/tmp/claude-502/-Users-ofri-repos-ofriperetz-dev/c09db196-869d-49ee-a5dd-6a2b80f786c7/scratchpad
export PATH="/Users/ofri/.nvm/versions/node/v24.12.0/bin:$PATH"
unset FORCE_COLOR
BUSY='vitest|stryker|next-build|next build|turbo run|playwright|jest'
quiet() {
  local l1 others free
  l1=$(sysctl -n vm.loadavg | awk '{print int($2)}')
  # Test runners of other sessions that are working (an idle leftover at 0% CPU does not count).
  others=$(ps -Ao pcpu=,comm=,args= | awk -v re="$BUSY" '$1 > 5 && $2 ~ /node|next-build|turbo|stryker/ && $0 ~ re' | wc -l | tr -d ' ')
  free=$(df -g /private/tmp | awk 'NR==2{print $4}')
  # Owner/coordinator 2026-11-02: start below load 30 (another session's runs keep it high); the
  # S,O,O,S order and per-minute samples carry the fairness; a pair whose mean loads differ by more
  # than 1.5x is repeated.
  [ "$l1" -lt 30 ] && [ "$free" -gt 15 ]
}
for spec in "$@"; do
  IFS=: read -r label engine pkg mode <<< "$spec"
  echo "$(date -u +%FT%TZ) waiting for a quiet machine: $label"
  until quiet; do sleep 60; done
  T=$(mktemp -d "$TMPDIR/sc8-$label.XXXX")
  { echo "label=$label engine=$engine pkg=$pkg mode=${mode:-}"; echo "start $(date -u +%FT%TZ) load $(sysctl -n vm.loadavg)"; } > "$S/$label.meta"
  ps -Ao pcpu=,comm= | awk '$1 > 20' | cut -c1-90 > "$S/$label.foreign"
  ( while sleep 60; do echo "$(date -u +%T) $(sysctl -n vm.loadavg)"; done ) > "$S/$label.loadlog" &
  sampler=$!
  cd "$W" || exit 1
  if [ "$engine" = stryker ] && [ "${mode:-}" = raw ]; then
    cp "packages/$pkg/src/hosts.ts" "$T/hosts.fixed.ts"
    git show origin/main:"packages/$pkg/src/hosts.ts" > "packages/$pkg/src/hosts.ts"
  fi
  t0=$(date +%s)
  if [ "$engine" = stryker ]; then
    # scripts/.mutation-keep.ts = scripts/mutation.ts that also keeps Stryker's per-mutant report.
    TMPDIR="$T" KEEP_REPORT="$S/$label.report.json" npx tsx scripts/.mutation-keep.ts full --package "$pkg" --concurrency 4 --engine stryker --out "$S/$label.result.json" > "$S/$label.log" 2>&1
  else
    srcs=$(npx tsx .mutation-sources.mts "$pkg")
    if [ "${mode:-}" = compat ]; then export STRYKER_COMPAT=1; else unset STRYKER_COMPAT; fi
    TMPDIR="$T" OXMUTATE_DEBUG_WATCHDOG=1 node "$S/prof.mjs" "$W/packages/oxmutate/.h2h/dist" "$W/packages/$pkg" "$S/$label.json" "$srcs" 4 > "$S/$label.log" 2>&1
    unset STRYKER_COMPAT
  fi
  t1=$(date +%s)
  kill "$sampler" 2>/dev/null
  if [ -f "$T/hosts.fixed.ts" ]; then cp "$T/hosts.fixed.ts" "packages/$pkg/src/hosts.ts"; fi
  { echo "end $(date -u +%FT%TZ) load $(sysctl -n vm.loadavg)"; echo "wall_s $((t1 - t0))"; } >> "$S/$label.meta"
  rm -rf "$T"
  # Stryker's own leftovers, in case it was stopped before it restored them
  find "packages/$pkg" -maxdepth 1 -name 'stryker-setup-*.js' -delete
  rm -rf "packages/$pkg/.stryker-tmp" "packages/$pkg/.mutation"
  git status --short "packages/$pkg" >> "$S/$label.meta"
  # A polluting mutant must not carry into the next run: put the manifest back, drop a stray test/.
  git checkout -- "packages/$pkg/package.json"; git clean -fdq "packages/$pkg/test"
  echo "$(date -u +%FT%TZ) done $label wall_s $((t1 - t0))"
done
