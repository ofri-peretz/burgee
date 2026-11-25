---
"hookset": minor
---

The Claude pack gains `verify-before-stop` and a `verify` skill. `verify-before-stop` (PostToolUse and Stop) sends a turn back once when it ends on uncommitted code that no passing test run has covered; docs and the `verifyIgnore` globs in `.claude/hookset.json` do not count, and the second stop of a turn always ends it. `init --claude` writes `.claude/skills/verify/SKILL.md` from a template once, and `check` fails while it is missing, keeps a `TODO(verify)` line, or loses `name: verify` or `## Feature map`. Upgrading: run `hookset init --claude`, then fill in the skill.
