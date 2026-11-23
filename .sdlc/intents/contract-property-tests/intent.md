# Intent — tests the model can't game: property-based inputs generated from the contract

> Opened from [`D-20261122-verification-toolkit`](../../decisions/D-20261122-verification-toolkit.md),
> station "Tests it can't game": the playbook's rule is not to let the model write the only test for its
> own code, and to ask for tests whose inputs it did not choose.

**Status:** draft · **Opened:** `2026-11-22` · **Owner:** `@ofri-peretz` · **Lane:** `ac-servers`

---

## What is wanted

A `contractdiff gen property-tests` target: for each operation, a test that sends inputs generated from
the contract's request schema to the user's handler (in process, no server) and asserts the response
matches the contract's response schema for its status.

- Inputs come from the schema, not from the model: valid values across each keyword's boundaries
  (`minLength`, `maximum`, `enum`, formats), plus invalid ones that must be refused with a 4xx.
- Generation is seeded and deterministic; a failing case prints its seed and the shrunk input.
- Responses are checked with our validator (`gen validator`), so the check is the same one production
  uses.
- Regeneration-safe like every server target: the generated test file is apicontract's, the user's
  handler is theirs.

## Why now

- The contract already says what every input may be. A test written by the model checks the cases the
  model thought of; inputs drawn from the schema check the ones it did not.
- Schemathesis does this for running servers (Python, HTTP); nothing does it in-process for
  TypeScript handlers generated from the same contract.

## Constraints

- Zero dependencies: our own generator over JSON Schema, no fast-check.
- Runs under vitest, jest and `node:test` alike, like `conformance`.
- Bounded: a default case count and a time budget per operation, both configurable.

## Success criteria

- On the server fixtures (NestJS, Hono, Fastify, Express), a planted handler bug that returns a wrong
  type for a boundary input fails the generated test; the unplanted handler passes.
- oxmutate on a fixture handler kills more mutants with the generated tests than with the
  hand-written example tests alone (measured, not assumed).

## Rejected

- **Wrapping Schemathesis.** Python and a running server; we want in-process TS.
- **fast-check.** A dependency for what the schema already describes.
