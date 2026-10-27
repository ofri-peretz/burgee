#!/usr/bin/env bash
# Reproduce the native-engine M0 measurement (spec.md, "M0 results") from scratch.
#
#   bash reproduce.sh <work-dir>
#
# Needs: this checkout built (`npx turbo run build --filter=burgee...`), Node 24, a Rust toolchain
# (`rustup`, stable), git and network for the subjects. Nothing is installed into the repository.
set -euo pipefail
WORK=${1:?work dir}
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../../../.." && pwd)
DIST=$REPO/packages/burgee/dist
CLI=$DIST/cli.js
BIN=$HERE/spike/target/release/burgee-migrate-spike
OUT=$HERE/results
mkdir -p "$WORK/subjects" "$OUT"

# 1. Subjects: the five field-trial projects at their trial SHAs (adoption-barriers-2026-10.md),
#    two large real monorepos, and A10's 1,000-file tree (migrate-bench.test.ts).
clone() { # <owner/repo> <sha|HEAD>
  local name; name=$(basename "$1")
  [ -d "$WORK/subjects/$name" ] && return
  if [ "$2" = HEAD ]; then git clone -q --depth 1 "https://github.com/$1.git" "$WORK/subjects/$name"
  else git clone -q --filter=blob:none "https://github.com/$1.git" "$WORK/subjects/$name" && git -C "$WORK/subjects/$name" checkout -q "$2"; fi
}
clone dwmkerr/wait-port 16083537; clone pahen/madge 456057b8; clone justkey007/tsc-alias 1077308b
clone soldair/node-qrcode 3848ed2c; clone svg/svgo e4cb29be
clone facebook/docusaurus HEAD; clone typeorm/typeorm HEAD # 2026-10-27: 4e6fe616, 5bdc6788
if [ ! -d "$WORK/subjects/bench1000" ]; then
  mkdir -p "$WORK/subjects/bench1000" && node "$HERE/bench-tree.mjs" "$WORK/subjects/bench1000"
  (cd "$WORK/subjects/bench1000" && git init -q && git add . && git -c user.email=m0@local -c user.name=m0 commit -qm m0)
fi
FIELD="wait-port madge tsc-alias node-qrcode svgo"
LARGE="docusaurus typeorm bench1000"

# 2. The spike, and the one mapping table both builds read.
(cd "$HERE/spike" && cargo build --release -q)
node "$HERE/export-mapping.mjs" "$DIST" "$HERE/mapping.tsv"
ls -l "$BIN" | awk '{print "{\"binaryBytes\":" $5 "}"}' > "$OUT/binary.json"

# 3. Bytes: the fixture, then every file of every subject.
node --input-type=module -e "
  const m = await import('$DIST/migrate.js'); const fs = await import('node:fs');
  fs.writeFileSync('$HERE/fixture/cli.expected.ts', m.rewriteSource(fs.readFileSync('$HERE/fixture/cli.ts', 'utf8')).source);"
"$BIN" rewrite "$HERE/mapping.tsv" "$HERE/fixture/cli.ts" | cmp - "$HERE/fixture/cli.expected.ts"
echo '{"fixture":"byte-identical"}' > "$OUT/bytes.jsonl"
rm -rf "$WORK/emit"
for p in $FIELD $LARGE; do
  "$BIN" bench "$HERE/mapping.tsv" "$WORK/subjects/$p" --runs 1 --emit "$WORK/emit/$p" > /dev/null
  echo "{\"subject\":\"$p\",\"compare\":$(node "$HERE/compare.mjs" "$DIST" "$WORK/subjects/$p" "$WORK/emit/$p")}" >> "$OUT/bytes.jsonl"
done

# 4. CPU phases, in process: JavaScript (phases.mjs, against dist) and Rust (bench), 11 runs each.
: > "$OUT/phases.jsonl"
for p in $FIELD $LARGE; do
  echo "{\"subject\":\"$p\",\"js\":$(node "$HERE/phases.mjs" "$DIST" "$WORK/subjects/$p" 11),\"rust1\":$("$BIN" bench "$HERE/mapping.tsv" "$WORK/subjects/$p" --threads 1 --runs 11),\"rust8\":$("$BIN" bench "$HERE/mapping.tsv" "$WORK/subjects/$p" --threads 8 --runs 11)}" >> "$OUT/phases.jsonl"
done

# 5. Whole commands, load-coherent (gate.mjs): per round, the JS `migrate --dry-run`, the JS per-file
#    work in a fresh process, and the Rust binary's whole pipeline, back to back. Plus what a JS caller
#    pays to reach the binary at all.
SUBJECTS=""; for p in $FIELD docusaurus typeorm; do SUBJECTS="$SUBJECTS $WORK/subjects/$p"; done
# shellcheck disable=SC2086 # one argument per subject
node "$HERE/gate.mjs" "$DIST" "$BIN" "$HERE/mapping.tsv" 7 $SUBJECTS > "$OUT/gate.json"
node "$HERE/spawn-cost.mjs" "$BIN" "$HERE/mapping.tsv" "$HERE/fixture/cli.ts" > "$OUT/spawn.json"

# 6. The argv core: 1 and 300 commands on burgee's API against commander, and where the time goes.
(cd "$HERE/argv" && node "$HERE/wall.mjs" 21 '{"node floor":["node","node.mjs"],"burgee load only":["node","load-only.mjs"],"burgee 1 cmd: greet":["node","prog1.mjs","greet","ada"],"burgee 1 cmd: --help":["node","prog1.mjs","--help"],"burgee 1 cmd: --schema":["node","prog1.mjs","--schema"],"burgee 300: greet":["node","prog300.mjs","greet","ada"],"burgee 300: --help":["node","prog300.mjs","--help"],"burgee 300: --schema":["node","prog300.mjs","--schema"],"commander 300: greet":["node","cmdr300.mjs","greet","ada"],"commander 300: --help":["node","cmdr300.mjs","--help"]}' > "$OUT/argv-wall.json"
  for a in "greet ada" "--help" "--schema"; do
    rm -rf cpu
    # shellcheck disable=SC2086 # the argv is two words for greet
    node --cpu-prof --cpu-prof-dir=cpu --cpu-prof-interval 50 prog300.mjs $a > /dev/null
    echo "== prog300 $a"; node profile-buckets.mjs cpu/*.cpuprofile
  done > "$OUT/argv-profile.txt"; rm -rf cpu)

# 7. The tables spec.md quotes.
node "$HERE/summarize.mjs" "$OUT" | tee "$OUT/summary.md"
