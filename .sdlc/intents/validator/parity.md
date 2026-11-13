# Parity — the validator against Zod, Valibot, ArkType, TypeBox and ajv

Design: [`spec.md`](./spec.md) · Intent: [`intent.md`](./intent.md) · **Status:** plan, 2026-11-13.

The owner, 2026-11-13: "build a full apples-to-apples benchmark and even before ensure that the
'apples' really equal to 'apples': ensure we support all if not more features than our competitors,
smallest bundle, throughput, etc."

So the order is fixed: **features first, then the benchmark**. A validator that is fast and small
because it does less has measured nothing.

## Where we are, measured

A matrix of 154 features, each cell decided by a runnable probe and never by documentation
(`benchmarks/results/validator/parity-2026-11-13/`: `features.json`, with the API and the probe behind
every cell, `semantics.md` and `summary.md`; the probe scripts themselves do not pass this
repository's lint as written and join the benchmark's own code when it is built). Read
2026-11-13 against zod 4.6.7, valibot 1.5.0, arktype 2.2.9, @sinclair/typebox 0.34.52 and ajv 8.20.0
with ajv-formats 3.0.1; 609 probes pass.

| Library | yes | partial | add-on | no |
| :-- | --: | --: | --: | --: |
| zod | 137 | 5 | 0 | 12 |
| valibot | 123 | 5 | 0 | 26 |
| arktype | 99 | 11 | 0 | 44 |
| typebox | 88 | 7 | 0 | 59 |
| ajv | 70 | 10 | 12 | 62 |
| **ours** | **34** | **2** | **0** | **118** |

That is the honest starting point: 34 of 154. The readings in the intent (throughput, bundle,
type-check cost) were taken at this feature count, so they are not yet comparable with anyone's.

Three things the probes found that the intent had wrong or did not know:

- **Two of the Zod gaps the intent lists are closed in 4.6.7**: `safeParse(v, { abortEarly: true })`
  exists, and so does a `schema.validate(v)` type guard. The cross-field refinement gap is still
  open: the rule is skipped when another field fails.
- **String length means two things.** zod and ajv count code points; valibot, arktype, typebox and
  ours count UTF-16 units.
- **A bug in ours:** `issues()` throws on a bigint input, because it prints the received value with
  `JSON.stringify`. `check()` is unaffected.

## The build list, in waves

A feature's wave is how many of the five competitors have it (yes, partial or add-on). The list is
`summary.md` § (b); the counts are below.

| Wave | Competitors that have it | Features | What it is, mostly |
| :-: | :-: | --: | :-- |
| 1 | 5 of 5 | 24 | any, unknown, never, a format registry, exclusive bounds, multipleOf, positive/negative, record (with a key schema), tuple, catchall, default, nullable, nullish, strict, strip, union, intersection, recursive and mutually recursive, coerce to number, custom type, metadata |
| 2 | 4 of 5 | 38 | bigint, Date, native enum, symbol, undefined; base64, datetime, email, ipv4, ipv6, url, uuid; exhaustive records, tuple rest; extend, keyof, omit, partial, pick, readonly, required, exact optional; coerce to boolean and Date, refinement and cross-field refinement at a path, transform, error map; assert, a parsed copy, input and output types; JSON Schema export, draft-07; CommonJS; the run-time door |
| 3 | 3 of 5 | 25 | NaN, void; trim and case transforms; ISO date and time, hex, hostname; bigint bounds, safe integer; Map, Set, min/max properties; brand, custom message, instanceof, pipe, preprocess, async refinement and parse; path as an array; draft 2020-12; Standard Schema |
| 4 | 2 of 5 | 25 | template literal, startsWith/endsWith/includes; base64url, cuid, duration, emoji, JSON string, jwt, nanoid, ulid, uuid versions; array contains and unique; not, xor, catch, codec; JSON Schema import; OpenAPI `nullable` and `readOnly`; Standard JSON Schema; ahead-of-time code generation |
| 5 | 1 of 5 | 6 | cidr, deep partial, draft-04, if/then/else, draft 2019-09, OpenAPI `discriminator` |

Done, per wave: every feature in it has a probe that passes, the matrix is
regenerated, the package holds 100% coverage and no surviving mutant, the three readers (`check`,
`issues`, `emit`) agree on a fuzzed corpus for every new kind (spec R2), and the bench is re-read so
the cost of each wave in bytes and in validations a second is on record.

"If not more" is the intent's own list: JSON Pointer paths, a `fix:` line on every issue, no `eval`
on the default path, formats as data, cross-field rules that always run and report at the field,
and a lossless JSON Schema export with every loss reported.

## Twelve decisions the competitors force, each taken by default

They disagree with each other, so "the same as everyone" is not available. Each default can be
reversed by the owner; `semantics.md` has the probe behind every row.

| # | Question | Default taken | Why |
| :-: | :-- | :-- | :-- |
| 1 | Unknown keys | Allowed and left alone; `strict` rejects; `strip` exists only on the parse path | Nobody rejects by default; passing through allocates nothing (spec R6) |
| 2 | `undefined` for an optional key | The same as absent; an exact-optional is a separate builder | Five of six agree |
| 3 | A key on the prototype | Satisfies a required field | All six agree |
| 4 | String length unit | **Code points**, changed from UTF-16 units | It is what JSON Schema's `maxLength` means and what zod and ajv do; both of our front doors need it |
| 5 | Integers | Any integer-valued double; `safe` is an option | JSON Schema's meaning; the Zod façade turns `safe` on |
| 6 | `Infinity` | Rejected | zod, typebox and ajv agree; JSON has no such number |
| 7 | What an object is | Any non-null, non-array object | zod, typebox and ajv agree |
| 8 | Issues by default | `check` answers yes or no; `issues` and Standard Schema's `validate` collect all | Four of six collect all |
| 9 | Discriminator tags | String, number and boolean literals | zod and valibot allow them; OpenAPI mappings are strings |
| 10 | Copy or in place | A copy only when something changed; the caller's object is never written to | arktype's model; zod's always-copy costs an allocation per parse, ajv's write-in-place surprises |
| 11 | Built-in formats | Each has a stated reference (RFC 3339 date-time, RFC 9562 uuid, WHATWG URL, the HTML standard's email), and they ship on their own subpath | The four libraries that ship formats agree on almost none of them, so "the same as Zod" means nothing |
| 12 | Tuples and coercion | Tuples are closed; coercion only where a schema asks for it, with written rules per source type | The five split on `""`, whitespace, hex and null |

## What parity will cost, and the rule for it

Today the interpreter is one `switch` over every kind, so every kind is in every bundle. At nine
kinds that is 1.1 KB; at 150 it is not. Valibot's 2.5 KB is the number to beat, and it gets there by
shipping only what a schema imports.

**Rule: a bundle carries only the kinds its schemas use.** A node holds a reference to its kind's
check function (a module-level function that captures nothing, so the node is still data plus a
named member, as the plugin contract allows). The emitter and the issue printer keep their tables,
because they are imported only by the code that needs them. This is decided before wave 1 builds on
the old shape, and it is measured: throughput and bundle bytes before and after, on the same schema.

## The benchmark, after parity

Three rules, from what the probes showed breaks a comparison:

1. **Like API with like, in separate tables, saying whether a copy is made.** Boolean guards
   together (typebox `Check`, ajv `validate`, arktype `.allows`, our `check`). Parse-and-report
   together (zod and valibot `safeParse`, an arktype call, typebox `Errors`, ajv with `allErrors`,
   our `check` plus `issues`). Today's reading sets zod's `safeParse` against our boolean `check`,
   which flatters us.
2. **Every default that differs is pinned, and both settings are reported**: unknown keys, and
   all issues against the first.
3. **The engine is named, and only proven-identical payloads are timed.** Run-time code generation
   (ajv, typebox's compiler, zod and arktype by default) apart from no-`eval` (valibot, typebox
   `Value.Check`, zod and arktype under a Content Security Policy, our `check`), with construction
   time on its own line. Before any timing, every library must give the same verdict on every
   payload of the scenario, or the scenario is not read.

Twelve scenarios already pass that precondition for all six (flat primitives, string bounds,
number bounds, enums, optional keys, nesting, arrays, a discriminated union, the composite order,
a 24-key object, a 1,000-item array). They cover only what ours can express today. Each wave adds
scenarios for what it adds: unions, tuples, records, formats, defaults, coercion, refinements.

Bundle bytes are read at equal features: each library's bundle for the same scenario, and each
library's bundle for a schema using every feature the scenario set touches.
