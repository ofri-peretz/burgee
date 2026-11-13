# Design — the validator

Intent: [`intent.md`](./intent.md). **Status:** draft, written 2026-11-13 on the owner's go-ahead
([`D-20261113-apicontract-build-go-ahead`](../../decisions/D-20261113-apicontract-build-go-ahead.md)).
`validator` is still a working name.

---

## The measurement this design rests on

The intent left one thing for design to measure first: can schemas written by hand, run with no
`eval`, pass ajv on throughput? Read 2026-11-13 with three throwaway engines on the intent's bench
schema and payloads, Node 24.13.0, Apple M4 Pro, load average 15 to 27, so read the ratios, not the
absolutes. ajv and Zod are the copies in this repo's `node_modules`, run in the same process.

| Engine | Valid / s | Invalid / s | Build ×500 | vs Zod | vs ajv |
| :-- | --: | --: | --: | --: | --: |
| ajv (compiles with `new Function`) | 12.87M | 8.63M | 1,215 ms | 10.1× | 1× |
| zod | 1.28M | 0.82M | 36.3 ms | 1× | 0.10× |
| Closures composed at build, one per field | 4.47M | 4.33M | 0.3 ms | 3.5× | 0.35× |
| Schemas as data, one interpreter with a `switch` | 4.32M | 4.21M | 0.4 ms | 3.4× | 0.34× |
| Straight-line code, written by hand as a generator would write it | 22.03M | 18.40M | 0 | 17.2× | 1.7× |

What it decides:

- **No `eval`, at run time, does not reach ajv.** Two different engine shapes land on the same
  4.3 to 4.5M a second. That is 3.4 times Zod and a third of ajv.
- **Generated code passes ajv by 1.7 times on valid payloads and 2.1 times on invalid ones**, with
  nothing to build at start-up.
- So, as the intent said it might: **the latency claim against ajv is made for generated validators
  only, and says so.** Hand-written schemas claim Zod.
- Both interpreters build 500 schemas in under half a millisecond, against 36 ms for Zod and 1.2 s
  for ajv. Construction is won by not doing work at construction.

**Step 1 as built, 2026-11-13** (same schema, payloads and machine, load average 16): 4.43M valid and
4.21M invalid a second against Zod's 1.30M and 0.85M, so 3.4 and 5.0 times; 500 schemas built in
0.9 ms against 36.8 ms. It is not yet in `baseline.ts`, which installs each library from npm; it
joins that script with the emitter (step 3), and until then these are a prototype's readings.

## Requirements

- **R1. A schema is data.** Every builder returns a plain, frozen node: a kind and its constraints.
  No class per kind, no closure. Everything else in this design is a reader of that node.
- **R2. Three readers, one meaning.** The interpreter (`check`), the code emitter (`emit`) and the
  JSON Schema writer read the same node. A property test holds them to it: for every schema and
  payload the fuzzer draws, the interpreter and the emitted code return the same verdict and the
  same issues.
- **R3. The default path never calls `eval` or `new Function`.** `check` interprets.
- **R4. Generated validators are straight-line ESM.** `emit(schema)` returns source text with no
  imports and no runtime of ours. `apicontract gen validator` writes that text to a file; that is
  the whole of the contract-first door.
- **R5. A just-in-time door, opt-in, on its own subpath.** `validator/jit` runs `emit` through
  `new Function` for servers that allow it. Same emitter, so R2 covers it. It is never imported by
  the default entry, and a lock fails the build if it is.
- **R6. Valid input allocates nothing.** The first pass answers yes or no. Issues are collected by a
  second pass that runs only after a no.
- **R7. Every issue carries a JSON Pointer, the keyword that failed, what was expected, and a
  `fix:` line** (Z9). Stopping at the first issue is an option of that second pass (Zod #1403).
- **R8. The static type is the builder's return type, computed once.** `Schema<T>` is one interface
  with one type parameter. No conditional chain is evaluated at the use site, and a schema can be
  annotated by hand, so it is safe under isolated declarations (Zod #3751).
- **R9. Options are objects, not chains.** `string({ min: 1, max: 32 })`, `optional(x)`,
  `object({ … })`, `array(item, { min: 1 })`, `discriminated('kind', { card, bank })`. The options
  object is the node's data, which is what keeps R1 true and the bundle small.
- **R10. A function is allowed only where the node names it:** `refine(schema, test, { path })` and
  `transform(schema, map)`. Export to JSON Schema reports each as a finding and never drops one
  silently (Z10).
- **R11. A format is data:** `{ name, pattern }` or `{ name, test }`, registered by the user. None
  needs a maintainer (the declined Zod requests for lat/long, phone, cron).
- **R12. It implements Standard Schema and Standard JSON Schema, in one pass** (Z8; Zod #6610).
- **R13. JSON Schema 2020-12 in and out**, graded by JSON-Schema-Test-Suite (Z2).
- **R14. A Zod-shaped façade on its own subpath**, graded by the share of Zod's own suite it
  passes (Z1). It maps Zod's chains onto nodes; the core does not grow chains for it.
- **R15. No dependencies; ESM and CJS; TypeScript 5.9, 6.0 and 7.0.**
- **R16. Every row of the intent's table is a script under `benchmarks/validator/`**, with the
  validator added to `baseline.ts` as one more library, so it is read by the same code as its
  competitors.

## Design

One private package, `packages/validator`, until the name is chosen.

| Entry | Holds | Needed by |
| :-- | :-- | :-- |
| `.` | Builders, `check`, `issues`, `Schema<T>`, `Infer` | Everyone |
| `./emit` | `emit(schema)`: a node to ESM source | `apicontract gen validator`, `./jit` |
| `./jit` | `compile(schema)`: `emit` through `new Function` | Servers that opt in |
| `./json-schema` | A node to JSON Schema and back, with findings | `apicontract gen json-schema`, extract |
| `./zod` | The Zod-shaped façade | Teams migrating |

Build order, one PR each, each with a check proven to fail first:

1. **Nodes, the interpreter and issues.** The kinds the bench schema needs first: string, number,
   boolean, literal, enum, array, object, optional, discriminated. The validator joins
   `baseline.ts`. Reads Z3, Z4, Z5 and Z6 against Zod.
2. **Types.** `Schema<T>` and `Infer`, read under each TypeScript (Z7). The bar is Zod's 664
   instantiations a schema; if the first shape misses it, the shape changes before anything is
   built on it.
3. **`emit`, and the equivalence property test** (R2). Reads Z3 against ajv. `apicontract`'s
   Phase 2 can start from here.
4. **`./jit`**, with the import lock (R5). Reads Z4 against ajv.
5. **The remaining kinds:** union, intersection, record, tuple, nullable, date, bigint, `refine`,
   `transform`, formats.
6. **JSON Schema in and out** (Z2, Z10) and **Standard Schema** (Z8).
7. **The requests Zod and ajv left open** (Z15, Z16), each with a test that names its issue.
8. **The Zod façade**, with Zod's suite vendored into `compat-oracle` and a control run (Z1).

The intent's three open questions are answered here: the drop-in subset is whatever share of Zod's
suite step 8 passes, published as a number; the engine lands before `apicontract`'s Phase 2 (steps 1
to 3); and there is no Quint model, because nothing here has state or ordering. If streaming or
async refinement comes into scope, that changes.

## Verification

- `npm test -w validator`: unit tests at 100% coverage, and the equivalence property test.
- `npx tsx benchmarks/validator/baseline.ts <workdir>`: every latency and value row, for the
  validator and each competitor, from one script.
- `compat-oracle`: Zod's suite through the façade, JSON-Schema-Test-Suite through `./json-schema`.
- An oxmutate floor from the first measured score.
- A lock that the default entry's import graph does not reach `./jit`.

## Rejected alternatives

- **`new Function` on the default path.** It is what makes ajv fast, and it is what CSP, React
  Native and Hermes refuse (ajv #2527, #1945, #1923).
- **Claiming ajv's speed for hand-written schemas.** Measured above: a third of ajv. The claim is
  made where it is true.
- **A class per kind with method chains, as Zod has.** Every method is in every bundle, and the
  type of a chain is computed link by link. The façade gives that surface to people who want it.
- **A compiler transform, as typia needs.** A constraint of the intent.
- **Closures composed at build.** Measured above at the same speed as the interpreter; nodes that
  are data can also be emitted and exported, closures cannot.
- **Forking Zod or Valibot.** A constraint of the intent.

## Out of scope

- A public name, a publish, or any claim in a README, until the intent's rows are read.
- Async validation and streaming, until someone asks.
- Forms, fake data and other things built on a schema: they are plugins or other packages, later.
