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

## Wave 1 as built, 2026-11-13

All 24 features that every competitor has are in, with the parse path that defaults, strip and
coercion need. Ours now reads **60 yes, 2 partial, 92 no** (from 34, 2, 118): the 24, plus the
run-time door and ahead-of-time code generation, which existed but the first reading had not seen.
314 tests, 100% coverage, no surviving mutant on the changed lines; 24 mutants are excluded, each
with its reason in the source, and they are the fast paths, where a mutant changes speed and not
the answer.

What parity cost so far, on the order schema, same script before and after (load average 21 to 45,
so the ratios, not the absolutes):

| | Before | After the restructure | After wave 1 |
| :-- | --: | --: | --: |
| Valid orders a second, interpreted | 4.45M | 4.38M | 4.04M |
| Bundle, `string` and `check` only | 761 B | 453 B | 723 B |
| Bundle, the whole order schema | 1,122 B | 1,108 B | 1,730 B |
| Type instantiations per schema | 328 | — | 333 to 339 |

- **A node carries its kind's check, and a bundle carries only the kinds it uses.** Calling it
  blind cost 11% (one call site sees every kind and is never inlined), so inside arrays, objects and
  unions the call goes through a three-way test on string, number and boolean, which the engine
  inlines. That costs 2% and keeps the tree shakeable.
- **Almost all of the 8.5% lost is counting code points.** With counting off the same tree reads
  4.26M. `length` is an upper bound and half of it a lower bound, so most strings are decided without
  counting; a field of fixed length (`last4`) has to be scanned.
- **The bundle grew 54%** for the full schema: a 24-member node, code points, formats, and the
  closed-object check. It is still under Valibot's 2,485 B on the earlier reading, and it is the
  number to watch each wave.

Choices wave 1 had to make that the twelve defaults did not cover, each reversible:

| Question | Taken | Why |
| :-- | :-- | :-- |
| `multipleOf` with a fractional step | A value within one rounding error of a multiple counts, so 0.3 is a multiple of 0.1 | Only zod agrees on all six probed values; valibot and typebox refuse 0.3, ajv refuses 0.3 and accepts 1.1, arktype throws |
| String to number | Only a whole string that is a JSON number (RFC 8259) and a finite double | The five agree on none of `""`, `" 1"`, `"0x10"`, `"Infinity"`, null |
| `check` and coercion | `check` never coerces; `parse` does | A guard that changes its input is not a guard |
| A union's issues | One issue, whose fix line says where each member first fails | No single member is the one that was meant |
| A union's parse | The first member that accepts its own output decides | — |
| An intersection's parse | Each member parses the input, and objects merge one level deep | One member's strip cannot starve the next |
| A required key | Must be present whatever its schema says of `undefined` | zod and valibot both refuse `{}` for a required `unknown` key |
| Recursion in emitted code | A lazy node's function is named before its body is written | Emitted functions call each other |
| Defaults | Applied wherever `undefined` arrives; handed out as given | Copying and validating a default is the author's choice, not a cost on every parse |
| Functions in a schema | `emit` refuses a schema that names one; `emitWith` takes them as hooks | No value a schema carries may become code |

Known and left for their own wave: discriminator tags are still strings only (decision 9), a
default or a coercion does not yet change the static output type (wave 2's input and output types),
and `issues` prints `NaN` as `number null`.

## Wave 2 as built, 2026-11-13

The features four of the five competitors have. Ours now reads **97 yes, 5 partial, 52 no** (from 60,
2, 92). 728 tests, 100% coverage, no surviving mutant on the changed lines, and no mutant excluded
beyond wave 1's 24.

| Group | What landed |
| :-- | :-- |
| Kinds | `bigint`, `date`, `nativeEnum`, `symbol`, `undefinedOf`, `instanceOf`; discriminator tags of any literal type through `discriminatedBy` |
| Schemas from schemas | `pick`, `omit`, `partial`, `required`, `extend`, `keyof`, `readonly`, `exactOptional`; records typed by enum keys, `recordOf` for the exhaustive one; `tuple` with `rest` |
| Values | `refine`, `transform`, coercion to boolean and Date, `promise`, `func`, a per-call message hook |
| Types | An input type and an output type (`Infer`, `InferInput`, `InferOutput`), and `assert` |
| Formats, on `./formats` | `email`, `url`, `httpUrl`, `uuid`, `datetime`, `date`, `ipv4`, `ipv6`, `base64`, each against a stated reference |
| JSON Schema, on `./json-schema` | `toJsonSchema(schema, { draft })` for 2020-12 and draft-07, returning the document and its findings |

**The rule across fields that always runs.** `refine(schema, test, { path, uses })` runs whenever the
fields it names are sound, and reports at `path`, even when another field fails. The scenario Zod
skips (intent, "where Zod is beatable") is a test: a wrong type at `/c` and the rule at `/b` are
both reported.

**What it cost a schema that uses none of it: nothing measurable.** Same scripts before and after,
load average 18 to 23:

| | Before wave 2 | After |
| :-- | --: | --: |
| Valid orders a second, interpreted | 4.00 to 4.06M | 4.05 to 4.11M |
| Bundle, `string` and `check` only | 716 B | 716 B |
| Bundle, the whole order schema | 1,725 B | 1,733 B |
| Type instantiations per schema (this wave's harness) | 420 | 461 |

What the subpaths cost only those who import them: a string with `email` is 796 B, all nine formats
1,782 B, a schema with JSON Schema export 4,657 B.

Three costs that did rise, each a thing to fix:

- **Type instantiations rose about 10%**, the price of a second (output) type. It is computed only
  when something inside a schema fills or maps; computing it always cost 725. The harness differs
  from the one behind the 328 in the intent, so the bench script's own number has to be re-read.
- **`parse` and `issues` still carry every kind**: 5,007 B and 3,972 B on the order schema, up from
  4,133 B and 3,419 B. Only `check` is per kind so far.
- **Tree-shaking of formats depends on `@__PURE__` marks**, held by a test. The family's other
  packages strip comments from `dist`; if this one adopts that step, the marks go.

Choices wave 2 made, each reversible:

| Question | Taken | Why |
| :-- | :-- | :-- |
| `optional` away from an object key | The schema is what it wraps; `check(optional(x), undefined)` is false and the type agrees | `optional` is a statement about a key |
| `readonly` | Type only; the same node | `parse` may hand back the caller's own object, and freezing would write to it; valibot, arktype and typebox do the same |
| A transform | `check`, `issues`, emitted code and the input type describe what goes in; the map runs on a second walk, after the whole value is accepted | One meaning for all three readers |
| A default | Stands for the missing input, so it is coerced, filled and mapped like one | Wave 1 handed it out untouched; this is what the output type has to mean |
| String to boolean | Exactly `"true"` and `"false"` | The five agree on nothing else |
| String to Date | An RFC 3339 date-time or full-date, on a day the calendar has | V8 alone reads 30 February as 1 March |
| The message hook | A per-call option that returns the whole message; nothing returned keeps the default with its `fix:` line | No global state |
| `url` | Any scheme the WHATWG parser accepts, `javascript:` included; `httpUrl` is http or https with a host | It is what all four competitors do, and it is why there are two |
| `email` | The WHATWG HTML pattern, so `a@b` passes | A stated reference, not a taste |
| Non-JSON kinds in JSON Schema | `{ not: {} }` with a finding | Never dropped silently (Z10) |
| A pattern format in JSON Schema | Written as `pattern` only | A consumer's `format: email` means something else |
| CommonJS | **Not built**: ESM only, as every package in this family | The design's R15 says ESM and CJS; this is the owner's call |

Checked outside the repository: for 28 schemas in both drafts, ajv's verdict on the exported
document equals `check`'s on 4,512 values.

Known and not yet fixed, first in wave 3: `issues`, `emit`, `parse` and the JSON Schema writer look
a hand-built node's kind up without an own-key check; and the emitter's refusal of a bad bound
prints it with `String()`, which runs an object's own `toString`.

Partial rows: the message hook is per call, with no locale bundles; `promise` and `func` check that
a value is one, not what it resolves to or takes.

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
