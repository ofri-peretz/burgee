#!/usr/bin/env bash
# oxmutate M1-alpha end to end: copy subject, oxc-instrument (compat or default), warm-run.
set -euo pipefail
MODE=$1; BUDGET=$2; OUT=$3; SUBJECT=$4; NM=$5
SB=$(mktemp -d)/sandbox
mkdir -p "$SB" && cp -r "$SUBJECT/src" "$SB/src" && ln -s "$NM" "$SB/node_modules"
FLAG=$([ "$MODE" = compat ] && echo --stryker-compat || true)
node instrument.mjs --root "$SB" --mutate src/array --out "$OUT.mutants.json" $FLAG > "$OUT.instrument.json"
node --import ./register.mjs warm-runner.mjs --sandbox "$SB" --report "$OUT.mutants.json" --namespace __oxmutate__ \
  --workers 4 --timeout "$BUDGET" --out "$OUT.results.json" > "$OUT.out.txt"
rm -rf "$(dirname "$SB")"
