#!/usr/bin/env bash
# Snapshot every open issue of the CLI libraries we build on or compete with.
# Output: docs/research/issues/<owner>_<repo>.json  (needs an authenticated `gh`).
set -euo pipefail
cd "$(dirname "$0")/../docs/research/issues"
for r in yargs/yargs tj/commander.js oclif/core oclif/oclif unjs/citty bombshell-dev/clack; do
  gh issue list -R "$r" --state open --limit 500 \
    --json number,title,body,labels,createdAt,comments,reactionGroups > "${r//\//_}.json"
  echo "$r: $(jq length "${r//\//_}.json")"
done
