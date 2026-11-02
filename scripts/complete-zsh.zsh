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
repeat 400 { zpty -r -t z chunk && buf+=$chunk; [[ $buf == *READY* ]] && break; sleep 0.1 }
sleep 0.2
zpty -w -n z "$line"$'\t'
buf=''
# zle echoes the typed line at once; the completion output follows after the function has
# been autoloaded. Once something beyond the echo has arrived the listing is under way, so
# clear the line (^U) and run a command whose output can only follow the whole list: zle
# finishes the TAB widget before it reads the next key. The marker's echo reads DONE$((6*7)),
# its output DONE42, so seeing DONE42 means the list is complete — no quiet window to guess
# (a 2 s one cost every call 2 s, and 0.8 s cut lists short under a loaded pre-push).
local quiet=0
repeat 300 {
  if zpty -r -t z chunk; then buf+=$chunk; quiet=0; else (( quiet++ )); fi
  (( ${#buf} > ${#line} + 8 && quiet >= 3 )) && break
  sleep 0.1
}
zpty -w z $'\x15print -r -- DONE$((6*7))'
repeat 300 { zpty -r -t z chunk && buf+=$chunk; [[ $buf == *DONE42* ]] && break; sleep 0.05 }
zpty -d z
# strip control sequences, then cut the marker's echo — zle echoes its first key (`p`), then a
# CR and the whole command again, so once CRs are gone it reads `pprint …` — and print what the
# shell showed
print -r -- "$buf" | perl -0pe 's/\e\[[0-9;?]*[A-Za-z]//g; s/\r//g; s/p?print -r -- DONE.*//s; s/\t/\n/g; s/ {2,}/\n/g' | grep -v -e '^\s*$' -e '^READY$' -e '^%$'
