---
"hookset": patch
---

guard-bash closes hook-skip and publish bypasses: `--no-veri` (git takes abbreviated options), `export LEFTHOOK=0` before the commit, `lefthook uninstall` and `rm`/`mv`/`chmod` on `.git/hooks`, `GIT_CONFIG_KEY_n=core.hooksPath`, `for`/`watch` CI polling, and yarn/bun publish, `unpublish`, `deprecate`, `dist-tag add|rm`, `lerna publish`, `/usr/bin/npm publish`. It now asks before a force push, `+ref`, `--delete`, `:ref`, `--mirror` or `--prune`.
