#!/usr/bin/env bash
# The reviewer `replz run` grades (.sdlc/intents/replz/): the rules CI gives its reviewer, read
# from the case's base, so the score is the score of what ships. It runs in the case's worktree at
# its head, with REPLZ_BASE set, and prints the findings as a JSON array on stdout.
#
# REPLZ_REVIEWER sets the reviewer's command line (default `claude -p`); point it at the model CI
# uses. It is split on spaces, so its words cannot be quoted or hold spaces. A rule a base commit has no REVIEW.md or checklist for is simply absent from the prompt.
set -euo pipefail
: "${REPLZ_BASE:?replz sets REPLZ_BASE; run this through replz run}"
reviewer=${REPLZ_REVIEWER:-claude -p}
prompt=$(mktemp)
trap 'rm -f "$prompt"' EXIT
{
  echo 'You review one pull request. Report what must change before it merges.'
  echo
  echo '## The rules (REVIEW.md, from the base branch)'
  git show "$REPLZ_BASE:REVIEW.md" 2>/dev/null || echo '(none at this base)'
  echo
  echo '## The checklist items this diff fires'
  if git cat-file -e "$REPLZ_BASE:.sdlc/checklist.yaml" 2>/dev/null; then
    npx --no triggerlist match "$REPLZ_BASE" 2>/dev/null || echo '(triggerlist unavailable at this head)'
  else
    echo '(none at this base)'
  fi
  echo
  echo '## The diff'
  git diff --no-color "$REPLZ_BASE" HEAD
  echo
  cat <<'PROMPT'
## Your answer
Work in two stages. First list every problem you notice (stage "raw"). Then check each one against
the code and keep only those you confirmed (stage "final"); a dropped one stays in "raw" only.
Print only a JSON array, no prose, of objects:
{"stage": "raw" | "final", "severity": "must-fix" | "should-fix" | "nit" | "pre-existing",
 "text": "<one sentence: what is wrong and where>", "item": "<checklist item id, if one prompted it>"}
Leave "item" out when no checklist item prompted the finding. Print [] when there is nothing.
PROMPT
} > "$prompt"
# The model may fence its JSON; print the array alone.
$reviewer < "$prompt" | sed -n '/^\[/,/^\]/p'
