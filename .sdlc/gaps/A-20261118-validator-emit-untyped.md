---
id: A-20261118-validator-emit-untyped
section: A
status: open
source: 'lane ac-validate, 2026-11-18 (PR #1629): validators.ts starts with // @ts-nocheck'
done_when: 'the validator emitter returns typed guards ((value: unknown) => value is T with T the inferred type), gen validator writes the inferred types beside each validator, and validators.ts type-checks without @ts-nocheck under TypeScript 5.9, 6.0 and 7.0'
---

**Generated validators are untyped.** The validator package's emitter returns
`(value) => boolean` with untyped parameters, so the `validator` target's `validators.ts` carries
`// @ts-nocheck` and does not yet generate the inferred TypeScript type the intent asks for. The
validator lane owns the emitter change; the validate lane then writes the types. A server or client
that imports these validators gets no narrowing until this closes.
