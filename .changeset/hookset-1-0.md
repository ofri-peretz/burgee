---
"hookset": major
---

hookset is 1.0. Its `.` entry, the `hookset` bin with `init` and `check`, their `--json` shape and exit codes, the lefthook presets (`commit-msg`, `pre-commit`, `pre-push`) and the steps each one runs, the Claude pack (`guard-bash`, `stop-after-3`) and the `.claude/hookset.json` fields it reads are now a semver contract: a station is removed, or a preset step starts failing where it passed, only in a 2.0. This also moves hookset past the 0.3.0 that npm will not take again. The evidence is D-20261124-hookset-triggerlist-1-0: 100% coverage, every spec row built, and a first full mutation run with no surviving mutant.
