---
'burgee': patch
'compat-oracle': patch
'benchmarks': patch
---

`burgee/yargs` follows yargs 18.2.0 and passes all 816 of its tests (real yargs: 814). With `SHELL` naming fish, `--get-yargs-completions` answers `value<TAB>description` and offers choices verbatim, and `completion` prints the fish script (`> ~/.config/fish/completions/<app>.fish`). The zsh script's `zsh_eval_context` test no longer carries a stray quote, so an autoloaded function is called rather than re-registered — the fix 18.2.0 made. The façade's bundle is 3 bytes smaller than before, fish included.

compat-oracle's yargs suite is re-vendored at `v18.2.0` (816 tests, twelve added), and `burgee migrate` names 18.2.0 as the yargs release `burgee/yargs` was graded at.
