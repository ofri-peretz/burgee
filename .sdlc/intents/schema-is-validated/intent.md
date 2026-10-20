# Intent — `--schema` output validates against a published schema

**Status:** shipped · **Opened:** `2026-09-17` · **Owner:** `@ofri-peretz` · **Approved:** 2026-09-23, under the owner's delegation, D-129 · **Shipped:** 2026-10-20 in the `feat/schema-group` PR, the last criterion (SC3)

---

## What is wanted

A consumer can validate what `--schema` printed, against a schema this package publishes,
without writing their own idea of the shape.

## Why now

F1 asks for the tree *"as JSON, carrying a `schemaVersion` and validating against a JSON
Schema published with the package"*. `schemaVersion: 1` ships. **The JSON Schema does not
exist and nothing validates anything.**

It was a published claim until 2026-09-17: `packages/burgee/README.md:65` and root
`README.md:104` both drew `--schema  versioned, JSON-Schema validated`. Struck the same day,
which is what surfaced this.

The consumer case is concrete: someone pins their CLI's surface in CI — *"these commands, these
flags"* — diffs `--schema` between releases, or generates a client from it. Every one of those
needs a schema to check against, and today each writes their own, which means each has a
different idea of what burgee promises.

## Affected users and systems

`packages/burgee` — `schema.ts`, the `exports` map, and the two READMEs whose claim was struck.

## Constraints

- **Zero external dependencies.** No validator from npm.
- `./schema.json` is taken: it is the **plugin** schema, byte-identical across eight hosts.
  This one needs its own subpath.
- The published schema is generated from or checked against `ProgramSchema`, never
  hand-maintained beside it — two descriptions of one shape is the defect, not the fix.

## Success criteria

1. `burgee/program-schema.json` resolves and is a valid JSON Schema.
2. A test takes real `--schema` output from a non-trivial program and validates it, failing
   when the document and the schema disagree.
3. The READMEs may say `JSON-Schema validated` again, and a check holds them to it.

## Open questions

**Which validator.** *Settled by D-123:* the family's one walker, `flagstaff/src/conforms.ts`, in
the test, and no runtime validator ships. The question as it was first put: `paratext/src/shape.ts` has `violations(schema, value, at)` — a
zero-dependency walker, already built and graded, and **not exported**. Reusing it means
paratext publishes it and burgee takes the edge; writing a second one means two JSON Schema
walkers in one repository, which is the thing PRINCIPLES rule 14 exists to prevent. The first
is almost certainly right and it is a paratext-lane change, so it is recorded rather than
assumed.

## Verified — 2026-10-20

| Criterion | State | Evidence |
| :-- | :-- | :-- |
| 1. `burgee/program-schema.json` resolves and is a valid JSON Schema | met | in `exports`, and in the published `burgee@1.6.5` |
| 2. a test validates real `--schema` output from a non-trivial program, and fails on disagreement | met | `scripts/program-schema.test.ts` |
| 3. the READMEs say `JSON-Schema validated` again, and a check holds them to it | met | both READMEs name `burgee/program-schema.json` beside `--schema`; `program-schema.test.ts` › SC3, red on `main` |

The npm README of `burgee` carries the sentence from its next release; the file it names has
shipped since R1.
