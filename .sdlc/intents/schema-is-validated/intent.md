# Intent — `--schema` output validates against a published schema

**Status:** review · **Opened:** `2026-09-17` · **Owner:** `@ofri-peretz`

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

**Which validator.** `paratext/src/shape.ts` has `violations(schema, value, at)` — a
zero-dependency walker, already built and graded, and **not exported**. Reusing it means
paratext publishes it and burgee takes the edge; writing a second one means two JSON Schema
walkers in one repository, which is the thing PRINCIPLES rule 14 exists to prevent. The first
is almost certainly right and it is a paratext-lane change, so it is recorded rather than
assumed.
