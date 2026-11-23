#!/usr/bin/env bash
# The reviewer `replay run` grades (.sdlc/intents/replay/): the rules CI gives its reviewer, read
# from the case's base, so the score is the score of what ships. It runs in the case's worktree at
# its head, with REPLAY_BASE set, and prints the findings as a JSON array on stdout.
#
# REPLAY_REVIEWER sets the reviewer's command line (default `claude -p`); point it at the model CI
# uses. A rule a base commit has no REVIEW.md or checklist for is simply absent from the prompt.
set -euo pipefail
: "${REPLAY_BASE:?replay sets REPLAY_BASE; run this through replay run}"
reviewer=${REPLAY_REVIEWER:-claude -p}
prompt=$(mktemp)
trap 'rm -f "$prompt"' EXIT
{
  echo 'You review one pull request. Report what must change before it merges.'
  echo
  echo '## The rules (REVIEW.md, from the base branch)'
  git show "$REPLAY_BASE:REVIEW.md" 2>/dev/null || echo '(none at this base)'
  echo
  echo '## The checklist items this diff fires'
  if git cat-file -e "$REPLAY_BASE:.sdlc/checklist.yaml" 2>/dev/null; then
    npx --no triggerlist match "$REPLAY_BASE" 2>/dev/null || echo '(triggerlist unavailable at this head)'
  else
    echo '(none at this base)'
  fi
  echo
  echo '## The diff'
  git diff --no-color "$REPLAY_BASE" HEAD
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
