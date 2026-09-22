---
'burgee': patch
---

`onError` fires on the commander and yargs front ends. It did not.

The plugin contract is three hooks, and the contract *between* them is what makes them usable:
`preRun` opens, and **exactly one of `postRun` or `onError` closes**. A plugin that starts a
span, opens a file, takes a lock or writes an audit line in `preRun` has nowhere to finish it
otherwise — and "otherwise" is every command that throws.

The engine held that. Both façades ran `preRun → handler → postRun` as a `.then` chain, so a
handler that threw **skipped `postRun` and never reached `onError`**: a plugin got an opening
hook and no closing one at all. And `onError` was never fired by either façade under any
circumstances, so a plugin declaring it was silently dead on a commander- or yargs-syntax
program — the two drop-in front ends this package exists for, and a hook neither commander nor
yargs can offer at all.

`plugin-lifecycle.test.ts` holds the contract on both façades, in both directions, and all four
new cases were proved to fail on the `.then`-only chain.

68 bytes on `burgee/yargs`, 62 on `burgee/commander`.
