---
id: B-20261101-handler-exit-code-with-data-untyped
section: B
status: open
source: first-adopter A4, oxmutate adoption report friction 5 (`.sdlc/research/adoption/oxmutate.md`)
recommendation: 'Type the convention rather than add a second path: a handler''s return type admits an optional `exitCode: ExitCode` beside its data, so `return { ...report, exitCode: ExitCode.RUNTIME }` type-checks and a bare number literal does not. `CommandContext.fail(code)` that keeps the returned data is the alternative. A type-level case proven red on `burgee@1.9.4` first, and the guide''s exit-code section shows the form'
---

A command that must fail and still return its report has one way to do it in burgee: put
`exitCode` on the returned data. `exitCodeOf` in `packages/burgee/src/execute.ts` reads
`data['exitCode']` and exits with it if it is an `ExitCode`, otherwise `OK`. `check.ts` uses it for
a refusal. `ctx.exit()` unwinds before the result is emitted, so it cannot carry the report.

oxmutate's `run` command returns its full mutation report when the score is under the threshold,
so it sets `data['exitCode']` on an untyped record. It works, and it is documented in `check.ts`
and above `exitCodeOf`. But nothing in the handler's return type shows the field, so an adopter
finds it by reading burgee's source or by a failing test. That is how oxmutate found it: breakage 1
in the report, filed as
[B-20261101-overwritten-exit-code-is-silent](./B-20261101-overwritten-exit-code-is-silent.md).

B, because it changes what a handler's signature promises.
