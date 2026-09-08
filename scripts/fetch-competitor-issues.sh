#!/usr/bin/env bash
# Snapshot every open issue of the CLI libraries we build on or compete with.
# Needs an authenticated `gh`.
#
#   fetch-competitor-issues.sh engine   # parser/framework trackers -> .sdlc/research/issues/<owner>_<repo>.json
#   fetch-competitor-issues.sh stack    # output-stack trackers     -> .sdlc/research/issues/output-stack/<owner>_<repo>.json
#   fetch-competitor-issues.sh          # both
#
# The engine set is what competitor-open-issues.md reads (snapshot 2026-09-05). The stack set
# is what output-stack-open-issues.md reads. They live in separate directories so refreshing
# one never moves the numbers the other cites.
#
# For the four stack repos that close by policy (chalk, ora, log-update, listr2) the stack set
# also snapshots issues *closed in the last three years* into <owner>_<repo>.closed.json, so
# the declined ones (state_reason "not_planned", a wontfix-style label, or locked as resolved)
# can be read. The REST issues endpoint returns pull requests too; they are dropped.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
set="${1:-all}"

fetch_open() { # owner/repo -> owner_repo.json
  gh api --paginate "repos/$1/issues?state=open&per_page=100" \
    --jq '.[] | select(.pull_request == null)' | jq -s . > "${1//\//_}.json"
  echo "$1 open: $(jq length "${1//\//_}.json")"
}

fetch_closed() { # owner/repo -> owner_repo.closed.json, closed in the last three years
  local since
  since=$(date -u -v-3y +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '3 years ago' +%Y-%m-%dT%H:%M:%SZ)
  gh api --paginate "repos/$1/issues?state=closed&per_page=100&since=$since" \
    --jq ".[] | select(.pull_request == null) | select(.closed_at >= \"$since\")" | jq -s . > "${1//\//_}.closed.json"
  echo "$1 closed since $since: $(jq length "${1//\//_}.closed.json")"
}

if [[ $set == engine || $set == all ]]; then
  cd "$here/../.sdlc/research/issues"
  for r in yargs/yargs tj/commander.js oclif/core oclif/oclif unjs/citty bombshell-dev/clack; do
    gh issue list -R "$r" --state open --limit 500 \
      --json number,title,body,labels,createdAt,comments,reactionGroups > "${r//\//_}.json"
    echo "$r: $(jq length "${r//\//_}.json")"
  done
fi

if [[ $set == stack || $set == all ]]; then
  mkdir -p "$here/../.sdlc/research/issues/output-stack"
  cd "$here/../.sdlc/research/issues/output-stack"
  for r in chalk/chalk alexeyraspopov/picocolors sindresorhus/ora sindresorhus/log-update \
           sindresorhus/boxen cli-table/cli-table3 SBoudrias/Inquirer.js bombshell-dev/clack \
           vadimdemedes/ink listr2/listr2; do
    fetch_open "$r"
  done
  for r in chalk/chalk sindresorhus/ora sindresorhus/log-update listr2/listr2; do
    fetch_closed "$r"
  done
fi
