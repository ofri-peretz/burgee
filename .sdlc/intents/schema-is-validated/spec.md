# Design — `--schema` output validates against a published schema

Intent: [`intent.md`](./intent.md). **Status:** approved (2026-09-23, under the owner's delegation, D-129). — the validator is an open question the
intent names, and this design does not pre-empt it.

---

## Requirements

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | **Not built** | `burgee/program-schema.json` — the JSON Schema for `ProgramSchema` | it does not exist |
| R2 | **Not built** | real `--schema` output validates against it | no validator is reachable from burgee |
| R3 | **Built** | the false claim is struck from both READMEs | `dependency-claim-lock.test.ts` — struck 2026-09-17 |

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
