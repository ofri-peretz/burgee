---
'seniority': minor
'burgee': patch
---

`explain` moves from `seniority/precedence` to `seniority/explain`.

A re-export is not free across a package boundary. `explain` was exported from `precedence.ts`,
so every program that resolved a configuration loaded `explain.js` whether or not anything ever
explained one — **1,018 bundled bytes and one more module on the startup path** for the branch
taken when a user asks *why did this option get that value*.

`import { explain } from 'seniority'` is unchanged: the root barrel still exports it, from its
new home. Only `seniority/precedence` stops re-exporting it. `burgee/config` re-exports it the
same way it always did, and `burgee`'s engine loads it behind an `await import('seniority/explain')`
on the `--explain` branch, which is now the only thing that pays for it.

Measured on burgee's core entry: **28,637 → 27,552 bundled bytes**, and 22 → 21 modules for
`import 'burgee'`.
