---
"hookset": patch
---

guard-bash: `git push --dry-run` still needs the long timeout (it runs pre-push; only `git commit --dry-run` skips hooks), `npm`/`pnpm` options before `publish` still ask a person, and dot segments in an edited path cannot step around a frozen glob. stop-after-3: an interrupted test run keeps the failure count instead of resetting it.
