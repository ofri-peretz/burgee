#!/usr/bin/env fish
# Prints what fish offers for <line> with <script> loaded (D4), one candidate per line.
#   scripts/complete-fish.fish <completion-script> <line…>
set script $argv[1]
set -e argv[1]
source $script
complete -C "$argv"
