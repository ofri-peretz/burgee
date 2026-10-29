---
id: A-20261028-yargs-argv-type-call-signature
section: A
status: closed
source: first-adopter second-target proof on emmercm/igir (`.sdlc/research/adoption/igir.md`)
done_when: 'The `Argv` interface `burgee/yargs` exports carries the call signature `@types/yargs` declares, `(args?: readonly string[] | string, cwd?: string): Argv<T>`, or a recorded decision says why not; a type-level case proven red on `burgee@1.9.2` first; and igir''s `npm run lint` passes on its migrated tree when the proof is re-run on the published version'
---

`burgee/yargs` exports the same type *names* as `@types/yargs`, and
`scripts/drop-in-type-surface-lock.test.ts` holds that. It does not hold their *shapes*, and one
differs in a way a real project's lint sees.

`@types/yargs` declares `interface Argv<T = {}> { (args?: readonly string[] | string, cwd?: string): Argv<T>; … }`:
every `Argv` is callable. `packages/burgee/src/yargs/types.ts` declares `Argv` without that call
signature. So a value typed `Argv` has `Object.prototype.toString` as its apparent `toString`
under burgee, and `Function.prototype.toString` under `@types/yargs`.

On igir, after swapping its yargs import for `burgee/yargs`, `tsc --noEmit` passes but
`npm run lint` fails with one error, in its `.fail()` handler:

```text
src/modules/argumentsParser.ts
  1324:33  error  '_yargs.help()' will use Object's default stringification format ('[object Object]') when stringified  @typescript-eslint/no-base-to-string
```

The code is unchanged and passes the same rule on `@types/yargs`. lint is a required step in
igir's CI (`node-lint`), so the migrated tree cannot merge as it is, and constraint 3 of
`first-adopter` rules out working around it in igir. Whether the call signature is right for a
yargs 18 instance is a fair question, since yargs 18's own instances are not callable; but the
drop-in claim is "the types `@types/yargs` gives you", and that is the shape a TypeScript project
has been checked against. A shape check, not only a name check, would have caught it.

**Closed 2026-10-29.** It publishes with burgee's next release. `Argv` in
`packages/burgee/src/yargs/types.ts` carries `@types/yargs`' call signature,
`(args?: readonly string[] | string, cwd?: string): Argv<T>`. A yargs 18 instance is not
callable, and burgee's is not either; the signature is there because the drop-in claim is the
types `@types/yargs` gives a program ([D-20261029-yargs-parse-callback-not-intercepted](../decisions/D-20261029-yargs-parse-callback-not-intercepted.md)).

`packages/burgee/src/facade-types.test.ts` › "Argv has the shape @types/yargs gives it" compiles
igir's `.fail()` handler, which stringifies `y.help()`, and a call `y(['--n', '1'], process.cwd())`,
with real `tsc` against the built `dist/*.d.ts`; the same fixture compiles against `@types/yargs`
in the control. A second case reads the shape from the checker: burgee's `Argv` has the same call
signatures as `@types/yargs`' and its apparent `toString` is declared by `Function`, which is what
`@typescript-eslint/no-base-to-string` reads. Both were red on `f801cf48e7`, whose `types.ts` is
`burgee@1.9.2`'s: `igir.ts:9 TS2349 This expression is not callable`, and no call signature at
all. Re-running igir's `npm run lint` on the published version belongs to the first-adopter
intent, with the rest of the igir proof.
