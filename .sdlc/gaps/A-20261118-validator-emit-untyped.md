---
id: A-20261118-validator-emit-untyped
section: A
status: closed
source: 'lane ac-validate, 2026-11-18 (PR #1629): validators.ts starts with // @ts-nocheck'
done_when: 'the validator emitter returns typed guards ((value: unknown) => value is T with T the inferred type), gen validator writes the inferred types beside each validator, and validators.ts type-checks without @ts-nocheck under TypeScript 5.9, 6.0 and 7.0'
---

**Generated validators are untyped.** The validator package's emitter returns
`(value) => boolean` with untyped parameters, so the `validator` target's `validators.ts` carries
`// @ts-nocheck` and does not yet generate the inferred TypeScript type the intent asks for. The
validator lane owns the emitter change; the validate lane then writes the types. A server or client
that imports these validators gets no narrowing until this closes.

**Closed 2026-11-18.** `emit(schema, { typescript: true })` and `emitWith` write a guard
`(v: any): v is T`, `T` from `typeOf` (the type `Infer` gives, held to it by `tsc` in
`emit-type.test.ts`). `gen validator` writes `export type <Name>` beside each validator and declares
it `(value: unknown) => value is <Name>`, with no `@ts-nocheck`.
`packages/apicontract/src/plugin-validator-types.test.ts` type-checks `validators.ts` for the corpus,
the sample and the run-time door under `strict` with TypeScript 5.9.3, 6.0.3 and 7.0.2 (each its own
`tsc`), and checks narrowing. Left: the `json-schema` target's `recheck.ts` still writes untyped
validators under `@ts-nocheck`; it opts in with `typed: true` in `plugin-json-schema.ts`.
