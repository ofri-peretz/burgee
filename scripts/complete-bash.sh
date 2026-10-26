#!/usr/bin/env bash
# Prints what bash offers for the given words with <script> loaded (D4).
#   scripts/complete-bash.sh <completion-script> <word>… ['' for a trailing space]
set -euo pipefail
script=$1; shift
# shellcheck source=/dev/null
source "$script"
COMP_WORDS=("$@"); COMP_CWORD=$(( ${#COMP_WORDS[@]} - 1 ))
fn=$(complete -p "${COMP_WORDS[0]}" | sed -E 's/.* -F ([^ ]+) .*/\1/')
# bash runs a completion function without `set -e`, and compgen exits 1 when nothing matches:
# an empty offer is an answer, not a failure of this script.
"$fn" || true
# bash 3.2 (macOS) treats an empty array as unset under `set -u`, so expand it only when set.
printf '%s\n' ${COMPREPLY[@]+"${COMPREPLY[@]}"}
