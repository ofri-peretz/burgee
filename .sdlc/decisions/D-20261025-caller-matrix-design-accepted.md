---
id: D-20261025-caller-matrix-design-accepted
subject: 'caller-matrix: is the first design — a declared features × callers registry whose every cell names an existing test or a reason, locked and rendered as /docs/callers — accepted for Build?'
taken: 'Accepted — by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-25'
date: '2026-10-25'
superseded_by: —
---

**Accepted. [`caller-matrix/spec.md`](../intents/caller-matrix/spec.md), written at this gate, is the
design Build implements, and the intent moves `draft → approved`.**

**Why accept rather than drop.** This intent is PRINCIPLES 5 made checkable: "every feature has a
conformance case per caller. Nothing may serve one caller well and another by accident." No shipped
intent delivers a matrix, and `/callers` does not exist. The cells, though, mostly exist already,
scattered across the packages. The five modes are roundel's policy (`policy.test.ts`).
flagstaff's `loop.test.ts` drives pipe, ci, json and accessible. caique's `ask.test.ts` holds the
numbered-list select. `scripts/prompt-exit-codes.test.ts` covers the non-TTY prompt. N12 covers
agent detection. What is missing is the one place that says which cell each of them fills, and
which cells nothing fills. So the design is a registry over tests that exist, not a new suite.

**The design accepted.** `examples/conformance/src/callers.ts` declares the matrix as data.
The features are help, errors, prompts, spinner, progress, table, box, theme, plugins,
completions and MCP. The callers are the five the intent names: `tty`, agent (`json`/`pipe`),
`ci`, `accessible`, and another program (`--schema`/`--mcp`/completions). Each cell is one of:

- `{ test: <file>, name: <test title> }`, a test that exists;
- `{ na: <reason> }`, rendering the static projection;
- `{ missing: true }`, an honest red cell.

A lock reads the registry and fails on a cell naming a test that does not exist, a feature or
caller with no cell, or a `missing` count that grows. `scripts/callers-page.ts` renders
`apps/docs/content/docs/callers.mdx` from the registry, drift-checked like the benchmarks page.
Building the missing cells is not this batch's job. They are listed, counted and ratcheted down.

**Criteria restated.**

- S2, "the non-TTY task never times out for any package", is restated to what can be measured: the
  B1 `non-tty-required` task on the three demos, and the prompt exit-code test.
- S3, the accessible transcript, is held per package by flagstaff `loop.test.ts` and caique
  `ask.test.ts`, and the matrix cites both.
- S4, "a first adopter passes the matrix", moves to `first-adopter`, which owns adoption.
  [D-068](./D-068.md) (the sixth caller: record both, build neither) stands.

**Build scope, one batch:** the registry, its lock (proven red by a cell naming a missing test),
and the generated `/docs/callers` page.
