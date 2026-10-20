# Design — `--schema` output validates against a published schema

Intent: [`intent.md`](./intent.md). **Status:** shipped (approved 2026-09-23 under the owner's delegation, D-129; R3 rebuilt in the `feat/schema-group` PR).

---

## Requirements

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** | `burgee/program-schema.json` — the JSON Schema for `ProgramSchema`, published as a data export beside the plugin schema | `scripts/program-schema.test.ts` |
| R2 | **Built** | real `--schema` output validates against it — in a test, with the family's one walker (`flagstaff/src/conforms.ts`), and no runtime validator ships (D-123). The fixture exercises every command field the file describes, and a key the file does not describe is refused | `scripts/program-schema.test.ts` |
| R3 | **Built** | both READMEs say `--schema` validates against `burgee/program-schema.json` again, and a lock holds every such claim to a file the package publishes | `scripts/program-schema.test.ts` › *the READMEs say --schema validates* (re-grounded 2026-10-20) |

## Design

Two pieces, and the order matters because the second decides the first's shape.

**The validator comes first.** `paratext/src/shape.ts` exports `violations(schema, value, at)`
internally — a zero-dependency JSON Schema walker that already reads `type`, `required`,
`minLength`, `additionalProperties` and `$defs`, and is graded by `shape.test.ts`. burgee
needs exactly that. Publishing it from paratext is one line and one new family edge; writing a
second walker in burgee is two descriptions of JSON Schema in one repository, which is what
rule 14 forbids.

**Then the document.** `ProgramSchema` is a TypeScript interface, so the schema is either
generated from it or checked against it — never a hand-kept twin, because a twin drifts and
this whole intent exists because a claim drifted.

Subpath: **`burgee/program-schema.json`**. `./schema.json` is the plugin schema and is
byte-identical across eight hosts; overloading it would break that identity for a document
that has nothing to do with plugins.

## Verification

A test that takes `--schema` from a program with subcommands, options of every type, arguments,
env bindings and examples — and validates it. The check that would have caught the original is
the one in R3: nothing compared the README's claim to the tree, which is why
`JSON-Schema validated` sat on two front pages describing something that did not exist.

## Rejected alternatives

- **A hand-written schema beside `ProgramSchema`.** Two descriptions of one shape; the drift
  is guaranteed and this intent is what drift looks like.
- **A validator from npm.** PRINCIPLES rule 2.
- **Reusing `./schema.json`.** It is the plugin contract, byte-identical across eight hosts,
  and `plugin-schema-lock` asserts that identity.

## Out of scope

F2, `--help --json`, which shipped separately on 2026-09-17 and shares the `commandSchemaOf`
shape — so whatever validates `--schema` validates that too, for free, once it exists.

## Re-grounded 2026-10-20

Against `main` at `326907ec`:

- **R3's check did not hold R3.** It cited `dependency-claim-lock.test.ts`, which reads dependency
  claims; nothing compared a README's `--schema` claim to the tree, so success criterion 3 had no
  check. The claim is made again, now that the file ships (in `exports` since R1, and in the
  published `burgee@1.6.5`), and `program-schema.test.ts` holds it: every README statement that
  says `--schema` validates names `burgee/program-schema.json`; that subpath maps to
  `./dist/program-schema.json`, which `schema-to-dist.mjs` copies from the file the same test
  validates real output against. A statement wrapped over two lines is read whole. The check
  fails on the struck 2026-09-17 diagram line, and on a README naming a file `exports` lacks.
- **The validator question.** Settled by D-123 before this re-grounding: the family's one walker
  is `flagstaff/src/conforms.ts`, used in the test, and no runtime validator ships.

## Build status

| Criterion | State | Evidence |
| :-- | :-- | :-- |
| 1. `burgee/program-schema.json` resolves and is a valid JSON Schema | met | `exports['./program-schema.json']`; `program-schema.test.ts` |
| 2. real `--schema` output validates, and the test fails when document and schema disagree | met | `program-schema.test.ts` › *the check can fail*, *accepts the document a program with every optional field prints* |
| 3. the READMEs say it again, and a check holds them to it | met | `README.md` (*What an agent sees*), `packages/burgee/README.md` (*What is in the box*, *For agents*); the SC3 lock, red on `main` for both READMEs |
