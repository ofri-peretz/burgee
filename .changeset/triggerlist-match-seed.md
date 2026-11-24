---
"triggerlist": patch
---

`match` on a base ref with no checklist file yet matches nothing and says so (`bootstrap: true`), as `brief` and `protect` do; a ref the checkout lacks still fails with its fix, and a base checklist that does not parse still fails. `seed` drafts each lock test's `check` with a command that fits the repository it reads: `npx vitest run --config <file>` for a root vitest config that names the lock folder, `npx vitest run` where vitest is otherwise in use, and `run <file>` where it is not. The README's exit-code table says `protect` exits 1 only with `--enforce`.
