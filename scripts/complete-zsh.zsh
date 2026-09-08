#!/usr/bin/env zsh
# Prints what zsh offers for <line> with <script> loaded, by pressing TAB in a real
# interactive zsh inside a pseudo-terminal (zsh/zpty). D4: the shell itself, not a parser.
#   scripts/complete-zsh.zsh <completion-script> <line…>
emulate -L zsh
zmodload zsh/zpty || { print -u2 'zsh/zpty unavailable'; exit 2 }
local script=$1; shift
local line="$*"
export TERM=xterm-256color COLUMNS=200 LINES=40
zpty -b z zsh -f -i
zpty -w z "PS1='' RPS1=''; unsetopt beep; autoload -Uz compinit; compinit -u -D; source ${(q)script}; bindkey '^I' complete-word; zstyle ':completion:*' completer _complete; zstyle ':completion:*' menu no; zstyle ':completion:*' list-prompt ''; zstyle ':completion:*' format ''; print READY"
local buf chunk; buf=''
# compinit on a loaded machine (CI, a parallel test run) can take seconds.
repeat 200 { zpty -r -t z chunk && buf+=$chunk; [[ $buf == *READY* ]] && break; sleep 0.1 }
sleep 0.2
zpty -w -n z "$line"$'\t'
buf=''
local quiet=0 i=0
repeat 100 {
  (( i++ ))
  if zpty -r -t z chunk; then buf+=$chunk; quiet=0; else (( quiet++ )); fi
  # zle echoes the typed line at once; the completion output follows after the function
  # has been autoloaded, so wait at least 1.5 s and then for the output to stay quiet.
  [[ -n $buf && $i -ge 15 && $quiet -ge 8 ]] && break
  sleep 0.1
}
zpty -d z
# strip control sequences, print what the shell showed after the line
print -r -- "$buf" | perl -pe 's/\e\[[0-9;?]*[A-Za-z]//g; s/\r//g; s/\t/\n/g; s/ {2,}/\n/g' | grep -v -e '^\s*$' -e '^READY$' -e '^%$'
