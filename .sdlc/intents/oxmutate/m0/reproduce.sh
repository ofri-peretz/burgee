#!/usr/bin/env bash
# Reproduce the oxmutate M0 measurement (m0-results.md) from scratch.
#
#   bash reproduce.sh <work-dir> <node_modules-dir>
#
# <node_modules-dir> must hold @stryker-mutator/core and @stryker-mutator/vitest-runner 10.0.0,
# vitest 4.1.11, esbuild, chai, @vitest/expect, @vitest/spy and fast-check (the 2026-10-26 run
# used eslint-harness's node_modules, which pins all of them). Nothing is installed by this script.
set -euo pipefail

WORK=${1:?work dir}
NM=${2:?node_modules dir}
HERE=$(cd "$(dirname "$0")" && pwd)
ES_TOOLKIT_COMMIT=d79f9bb6ce4f4014d9f2a06b5882ed8b93f65e46 # toss/es-toolkit main, 2026-10-24

mkdir -p "$WORK"
cd "$WORK"

# 1. Subject: es-toolkit's src/array (69 source files, 68 spec files, 301 tests), MIT.
if [ ! -d es-toolkit ]; then
  git clone -q https://github.com/toss/es-toolkit.git
  git -C es-toolkit checkout -q "$ES_TOOLKIT_COMMIT"
fi
rm -rf subject && mkdir subject
cp -r es-toolkit/src subject/src
ln -s "$NM" subject/node_modules
echo '{ "name": "m0-subject", "type": "module", "private": true }' > subject/package.json
echo '{ "compilerOptions": { "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler", "strict": true, "skipLibCheck": true, "allowImportingTsExtensions": true, "noEmit": true } }' > subject/tsconfig.json
cp "$HERE/spike/stryker.config.mjs" "$HERE/spike/vitest.config.mjs" subject/

# 2. Baseline: Stryker 10.0.0, 4 workers, perTest coverage, sandbox kept for the spike.
for run in 1 2 3 4 5; do
  (cd subject && RUN=$run /usr/bin/time -l node node_modules/@stryker-mutator/core/bin/stryker.js run \
    > "stryker-run$run.log" 2> "stryker-run$run.time")
done

# 3. Spike, part 1: warm runner over Stryker's own instrumented sandbox and mutant ids.
rm -rf spike && cp -r "$HERE/spike" spike && ln -s "$NM" spike/node_modules && mkdir -p spike/runs
SANDBOX=$(ls -d subject/.stryker-tmp/sandbox-* | head -1)
cd spike
for budget in 5000 500; do
  for run in 1 2 3 4 5; do
    /usr/bin/time -l node --import ./register.mjs warm-runner.mjs --sandbox "../$SANDBOX" \
      --report ../subject/reports/stryker-run1.json --workers 4 --timeout "$budget" \
      --out "runs/warm-t$budget-r$run.json" > "runs/warm-t$budget-r$run.out" 2> "runs/warm-t$budget-r$run.time"
  done
done

# 4. Spike, part 2: oxc instrumenter + warm runner, end to end (Stryker-compat and default modes).
for budget in 500 5000; do
  for run in 1 2 3 4 5; do
    /usr/bin/time -l ./e2e.sh compat "$budget" "runs/e2e-compat-t$budget-r$run" ../subject "$NM" \
      2> "runs/e2e-compat-t$budget-r$run.time"
  done
done
for run in 1 2 3; do
  /usr/bin/time -l ./e2e.sh default 500 "runs/e2e-default-t500-r$run" ../subject "$NM" 2> "runs/e2e-default-t500-r$run.time"
done

# 5. Medians, ranges and verdict agreement per series.
node summarize.mjs
