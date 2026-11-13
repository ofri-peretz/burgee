# Summary

154 features, 6 subjects. Everything below is computed by `run.mjs` from the probes; the prose in (c) and the fairness rules in (d) are written by hand from `semantics.md`.

Probe failures this run: none.


## How to read a cell

- **yes**: a probe in `probes/<library>.mjs` accepted and rejected the values the definition names.
- **partial**: works, with the limit stated in the note.
- **addon**: works only with an official extra package (for ajv: `ajv-formats`).
- **no**: no API was found in the package's exports and `.d.ts`, or a probe failed. Things only a user-written predicate can do count as no.
- For "ours": the source was read, and each yes was also run on a copy of the source in `ours-snapshot/` (imports rewritten from `.js` to `.ts`, nothing else).

## What "ours" has today

`prim.any`, `prim.boolean`, `prim.enum`, `prim.integer`, `prim.literal`, `prim.never`, `prim.null`, `prim.number`, `prim.string`, `prim.unknown`, `str.length`, `str.max`, `str.min`, `str.regex`, `fmt.custom`, `num.exclusive`, `num.finite`, `num.int`, `num.max`, `num.min`, `num.multiple_of`, `num.negative`, `num.positive`, `col.array`, `col.array_max`, `col.array_min`, `col.record`, `col.record_key_schema`, `col.tuple`, `obj.catchall`, `obj.default`, `obj.nullable`, `obj.nullish`, `obj.object`, `obj.optional`, `obj.passthrough`, `obj.strict`, `obj.strip`, `comp.discriminated`, `comp.discriminated_nested` (partial), `comp.intersection`, `comp.mutual_recursive`, `comp.recursive`, `comp.union`, `val.coerce_number`, `val.custom_type`, `val.metadata`, `beh.abort_early`, `beh.collect_all`, `beh.in_place`, `beh.infer`, `beh.issue_code`, `beh.issue_path`, `beh.path_pointer`, `beh.type_guard`, `rt.aot`, `rt.csp_safe`, `rt.esm`, `rt.jit`, `rt.no_eval_default`, `rt.tree_shake` (partial), `rt.zero_deps`.

Features "ours" has that at least one competitor lacks: `num.finite` (missing in arktype); `comp.discriminated` (missing in typebox); `comp.discriminated_nested` (missing in typebox, ajv); `beh.abort_early` (missing in arktype); `beh.infer` (missing in ajv); `beh.path_pointer` (missing in zod, valibot, arktype); `rt.aot` (missing in zod, valibot, arktype); `rt.jit` (missing in valibot); `rt.no_eval_default` (missing in zod, arktype, ajv); `rt.tree_shake` (missing in arktype, ajv); `rt.zero_deps` (missing in arktype, ajv).

## (a) Counts per library

| Library | yes | partial | addon | no |
| :-- | --: | --: | --: | --: |
| zod | 137 | 5 | 0 | 12 |
| valibot | 123 | 5 | 0 | 26 |
| arktype | 99 | 11 | 0 | 44 |
| typebox | 88 | 7 | 0 | 59 |
| ajv | 70 | 10 | 12 | 62 |
| ours | 60 | 2 | 0 | 92 |

## (b) Features at least one competitor supports and "ours" does not (92)

Ordered by the number of competitors (of 5) with yes, partial or addon. This is the build list.

| # of 5 | Feature | id | Who has it |
| --: | :-- | :-- | :-- |
| 4 | bigint | `prim.bigint` | zod, valibot, arktype, typebox |
| 4 | Date object | `prim.date` | zod, valibot, arktype, typebox |
| 4 | native TS enum | `prim.native_enum` | zod, valibot, arktype, typebox |
| 4 | symbol | `prim.symbol` | zod, valibot, arktype, typebox |
| 4 | undefined | `prim.undefined` | zod, valibot, arktype, typebox |
| 4 | base64 | `fmt.base64` | zod, valibot, arktype, ajv (addon) |
| 4 | ISO 8601 / RFC 3339 date-time | `fmt.datetime` | zod, valibot, arktype (partial), ajv (addon) |
| 4 | email | `fmt.email` | zod, valibot, arktype, ajv (addon) |
| 4 | ipv4 | `fmt.ipv4` | zod, valibot, arktype, ajv (addon) |
| 4 | ipv6 | `fmt.ipv6` | zod, valibot, arktype, ajv (addon) |
| 4 | url | `fmt.url` | zod, valibot, arktype, ajv (addon) |
| 4 | uuid | `fmt.uuid` | zod, valibot, arktype, ajv (addon) |
| 4 | record with enum keys, exhaustive | `col.record_enum_exhaustive` | zod, valibot, typebox, ajv |
| 4 | record with enum keys | `col.record_enum_keys` | zod, valibot, typebox, ajv |
| 4 | tuple with rest | `col.tuple_rest` | zod, valibot, arktype, ajv |
| 4 | exact optional key | `obj.exact_optional` | zod, valibot, arktype, typebox (partial) |
| 4 | extend / merge | `obj.extend` | zod, valibot, arktype, typebox |
| 4 | keyof | `obj.keyof` | zod, valibot, arktype, typebox |
| 4 | omit | `obj.omit` | zod, valibot, arktype, typebox |
| 4 | partial | `obj.partial` | zod, valibot, arktype, typebox |
| 4 | pick | `obj.pick` | zod, valibot, arktype, typebox |
| 4 | readonly | `obj.readonly` | zod, valibot, arktype, typebox |
| 4 | required | `obj.required` | zod, valibot, arktype, typebox |
| 4 | coerce string to boolean | `val.coerce_boolean` | zod, valibot, typebox, ajv (partial) |
| 4 | coerce string to Date | `val.coerce_date` | zod, valibot, arktype, typebox |
| 4 | error map / i18n | `val.error_map` | zod, valibot, arktype (partial), typebox |
| 4 | function | `val.function` | zod, valibot, arktype, typebox (partial) |
| 4 | promise | `val.promise` | zod (partial), valibot (partial), arktype (partial), typebox (partial) |
| 4 | refinement | `val.refine` | zod, valibot, arktype, ajv |
| 4 | cross-field refinement at a field path | `val.refine_path` | zod (partial), valibot, arktype (partial), ajv (partial) |
| 4 | transform | `val.transform` | zod, valibot, arktype, typebox |
| 4 | assert API | `beh.assert` | zod (partial), valibot, arktype (partial), typebox |
| 4 | returns a parsed copy | `beh.clone` | zod, valibot, arktype (partial), typebox |
| 4 | input vs output types | `beh.io_types` | zod, valibot, arktype, typebox |
| 4 | draft-07 | `io.draft_07` | zod, arktype, typebox, ajv |
| 4 | JSON Schema export | `io.json_schema_export` | zod, arktype, typebox, ajv |
| 4 | CommonJS | `rt.cjs` | zod, valibot, typebox, ajv |
| 3 | NaN | `prim.nan` | zod, valibot, arktype |
| 3 | void | `prim.void` | zod, valibot, typebox |
| 3 | toLowerCase transform | `str.lowercase` | zod, valibot, arktype |
| 3 | unicode normalize transform | `str.normalize` | zod, valibot, arktype |
| 3 | trim transform | `str.trim` | zod, valibot, arktype |
| 3 | toUpperCase transform | `str.uppercase` | zod, valibot, arktype |
| 3 | ISO date | `fmt.date` | zod, valibot, ajv (addon) |
| 3 | hex string | `fmt.hex` | zod, valibot, arktype |
| 3 | hostname | `fmt.hostname` | zod, valibot, ajv (addon) |
| 3 | ISO time | `fmt.time` | zod, valibot, ajv (addon) |
| 3 | bigint bounds | `num.bigint_range` | zod, valibot, typebox |
| 3 | safe integer | `num.safe_int` | zod, valibot, arktype |
| 3 | Map | `col.map` | zod, valibot, arktype (partial) |
| 3 | Set | `col.set` | zod, valibot, arktype (partial) |
| 3 | min/max properties | `obj.property_count` | valibot, typebox, ajv |
| 3 | brand | `val.brand` | zod, valibot, arktype |
| 3 | custom error message | `val.custom_message` | zod, valibot, arktype |
| 3 | instanceof | `val.instanceof` | zod, valibot, arktype |
| 3 | pipe | `val.pipe` | zod, valibot, arktype |
| 3 | preprocess | `val.preprocess` | zod, valibot, arktype |
| 3 | async refinement | `val.refine_async` | zod, valibot, ajv |
| 3 | async parse | `beh.async_parse` | zod, valibot, ajv |
| 3 | path as array | `beh.path_array` | zod, valibot, arktype |
| 3 | draft 2020-12 | `io.draft_2020_12` | zod, arktype, ajv |
| 3 | Standard Schema | `io.standard_schema` | zod, valibot, arktype |
| 2 | template literal string | `prim.template_literal` | zod, typebox |
| 2 | endsWith | `str.ends_with` | zod, valibot |
| 2 | includes | `str.includes` | zod, valibot |
| 2 | startsWith | `str.starts_with` | zod, valibot |
| 2 | base64url | `fmt.base64url` | zod, arktype |
| 2 | cuid / cuid2 | `fmt.cuid` | zod, valibot (partial) |
| 2 | ISO 8601 duration | `fmt.duration` | zod, ajv (addon) |
| 2 | emoji | `fmt.emoji` | zod, valibot |
| 2 | JSON string | `fmt.json_string` | valibot, arktype |
| 2 | jwt | `fmt.jwt` | zod, valibot (partial) |
| 2 | nanoid | `fmt.nanoid` | zod, valibot |
| 2 | regex-as-format | `fmt.regex` | arktype, ajv (addon) |
| 2 | ulid | `fmt.ulid` | zod, valibot |
| 2 | uuid of a given version | `fmt.uuid_version` | zod, arktype |
| 2 | array contains | `col.array_contains` | typebox, ajv |
| 2 | array unique items | `col.array_unique` | typebox, ajv |
| 2 | not | `comp.not` | typebox, ajv |
| 2 | exactly-one-of (xor) | `comp.one_of` | zod, ajv |
| 2 | catch / fallback | `val.catch` | zod, valibot |
| 2 | codec (two-way transform) | `val.codec` | zod, typebox |
| 2 | JSON Schema import | `io.json_schema_import` | zod, ajv |
| 2 | OpenAPI 3.0 `nullable` | `io.openapi_nullable` | zod, ajv |
| 2 | OpenAPI/JSON Schema `readOnly` | `io.openapi_readonly` | zod, ajv (partial) |
| 2 | Standard JSON Schema | `io.standard_json_schema` | zod, arktype |
| 1 | cidr block | `fmt.cidr` | zod |
| 1 | deep partial | `obj.deep_partial` | zod |
| 1 | conditional (if/then/else) | `comp.if_then_else` | ajv |
| 1 | draft-04 | `io.draft_04` | zod |
| 1 | draft 2019-09 | `io.draft_2019_09` | ajv |
| 1 | OpenAPI `discriminator` (+ mapping) | `io.openapi_discriminator` | ajv (partial) |

"ours" is partial on: `comp.discriminated_nested` (Works for a second discriminator key under a case, because a case can be any node. A nested union on the same key has no use (the outer lookup already chose), and there is no test for nesting in validator.test.ts.); `rt.tree_shake` (check() carries only the kinds a program builds (measured 2026-11-13 with esbuild: 721 B min+gzip for string and check). Still partial: issues() and parse() each read a table of every kind, and package.json has no sideEffects field.).

## (c) Where "ours" needs a semantic decision because competitors disagree

From `semantics.md`; the verdict in brackets is what the source does today.

1. **Unknown keys** (table 1). [ours: allowed and left alone by default; `strict` rejects, `strip` leaves them out of what `parse` returns, and a schema holds them to it.] zod and valibot strip, arktype/typebox/ajv pass through, and strict is opt-in everywhere. Decide whether strict and strip exist, and whether strip may allocate given R6 ("valid input allocates nothing").
2. **`undefined` for an optional key** (table 4). [ours: undefined is the same as absent, for optional and for required.] arktype rejects `{ a: undefined }` for an optional key; zod, valibot and arktype each ship an exact-optional. Decide whether to add one, and whether JSON Schema export of optional() is lossless either way.
3. **Inherited keys** (table 4, last row). [ours: reads `value[key]`, so a key on the prototype satisfies a required field; only the discriminator lookup uses Object.hasOwn.] Decide whether own-ness matters.
4. **String length unit** (table 6). [ours: code points since wave 1, like zod and ajv; UTF-16 units before.] zod and ajv count code points, which is what JSON Schema `maxLength` means. Both front doors pull the same way here: the Zod façade (R14, graded by Zod's suite) and JSON Schema (R13, graded by the JSON-Schema-Test-Suite, which has code-point cases) each need code points, and the current `.length` matches neither incumbent the intent names as the bar.
5. **Safe integers** (table 5). [ours: Number.isInteger, so 2^53 and 1e300 pass.] zod bounds `int` to the safe range; JSON Schema does not. Decide per front door: the Zod façade (R14) and JSON Schema (R13) want different answers.
6. **Infinity** (table 2). [ours: rejected, cannot be allowed.] Agrees with zod, typebox and ajv; valibot and arktype accept it. Only a decision if a façade must reproduce them.
7. **Object-ness** (table 3). [ours: any non-null, non-array object, so class instances, Dates and Maps pass an object schema.] Same as zod, typebox and ajv; valibot and arktype also take arrays. Decide whether a Date passing `object({})` is intended once a date kind exists.
8. **Error collection default** (table 15). [ours: check() is a boolean; issues() collects all, `first` is opt-in.] ajv defaults to first, the rest to all. The split API already answers this; the decision is what the Standard Schema `validate` (R12) returns by default.
9. **Discriminated union** (table 14). [ours: string tags only, issue at the tag pointer with keyword `tag`; a case schema need not declare the tag itself.] zod and valibot accept literal tags of any primitive type; ajv reports at the root. Decide on non-string tags (numbers, booleans) and on what the OpenAPI `discriminator.mapping` import maps to.
10. **Clone or in place** (table 13). [ours: `check` never copies; `parse` copies only what changed and never writes to the input.] The moment transform, default, strip or coercion land (spec steps 5 to 7) there must be an output value; decide between arktype's model (copy only when something changes) and zod's (always copy), and never ajv's (write into the caller's object).
11. **Formats** (tables 7 to 11). [ours: none; R11 says a format is user data.] There is no agreed meaning of email, url, uuid or datetime across the four libraries that ship them. If built-ins are added, each needs a stated reference (RFC 3339 for date-time, RFC 9562 for uuid, WHATWG URL or RFC 3986 for url), because "same as zod" and "same as ajv" are different sets.
12. **Tuple extras and coercion** (tables 16, 17). [ours: tuples are closed; coercion reads only a string that is, whole, a JSON number.] When tuples land, decide strict vs open by default; if coercion is ever added, `""`, whitespace, hex and null need written rules because the five libraries give different answers.
13. **A bug, not a decision**: `issues()` throws on a bigint input ("Do not know how to serialize a BigInt", issues.ts:38), found by the prim.number probe. check() is unaffected.

## (d) Proposed benchmark scenarios

Twelve schema shapes that all six subjects can express today. Each is written once in a neutral description in `probes/scenarios.mjs` and compiled to zod, valibot, arktype, typebox, JSON Schema for ajv, and "ours" (the copy of the source), so the six schemas cannot drift apart. `run.mjs` then runs every payload through 9 entry points (zod safeParse, valibot safeParse, arktype allows, arktype call, typebox Value.Check, typebox compiled, ajv, ours check, ours issues) and compares verdicts. No timing is done here.

| Scenario | Exercises | Valid payloads | Invalid payloads | Verdicts across all entry points |
| :-- | :-- | --: | --: | :-- |
| S01 flat primitives | object of string, integer, number, boolean | 3 | 8 | identical |
| S02 string bounds and pattern | min/max length (ASCII only) and two regexes | 2 | 6 | identical |
| S03 number bounds | inclusive min/max on numbers and integers, within the safe range | 3 | 7 | identical |
| S04 enum and literal | string enum, numeric enum, string/number/boolean literals | 2 | 6 | identical |
| S05 optional keys | required and optional keys; absent expressed by omission, never by undefined or null | 4 | 5 | identical |
| S06 nested objects | three levels of nesting | 1 | 6 | identical |
| S07 array of primitives | array with min/max items of bounded strings; array of integers | 2 | 8 | identical |
| S08 array of objects | array of line items | 2 | 6 | identical |
| S09 discriminated union | three members on a string tag, selected by the tag | 3 | 8 | identical |
| S10 order (composite) | the intent.md bench shape: nested object, array of objects, enum, optional keys, regexes, discriminated union | 3 | 9 | identical |
| S11 wide object | 24 flat keys of mixed primitive types (failure on the first, a middle and the last key) | 1 | 4 | identical |
| S12 long array | 1,000 bounded integers (failure at the first, middle and last index) | 2 | 4 | identical |

All verdicts matched the expected verdict for every payload and entry point.

What the six cannot share, and so what these scenarios leave out: unions other than discriminated ones, tuples, records, nullable, formats, dates, transforms, defaults, coercion, strict/strip modes and refinements (see list (b): "ours" has none of them yet).

### Fairness rules a benchmark must follow

1. **Compare like API with like, in two separate tables, and say whether a copy is made.**
   - *Boolean guard* (yes/no, no issue list): `typebox Value.Check` / `TypeCompiler.Check`, `ajv validate()` on the valid path, `arktype .allows()`, `ours check()`. `zod .validate()` and `valibot v.is()` return a boolean but were observed to run the whole parse pipeline, so they belong here only with that footnote.
   - *Parse and report* (issues with paths): `zod safeParse`, `valibot safeParse`, `arktype T(value)`, `typebox Value.Check` then `[...Value.Errors()]`, `ajv` compiled with `allErrors: true` then reading `.errors`, `ours check()` then `issues()`.
   - Never put ajv/typebox boolean numbers beside zod/valibot `safeParse` numbers. On valid input zod and valibot also build a deep copy (and strip unknown keys); arktype, typebox, ajv and ours return the input or a boolean. State "copies: yes/no" in a column.
2. **Pin every default that differs, and report both settings where it matters.** Unknown keys: pass-through everywhere for the guard table (zod and valibot cannot avoid the copy; say so), strip everywhere for a separate "sanitise" row. Error collection: all-errors for the report table (ajv needs `allErrors: true`), first-error as its own row (`zod { abortEarly: true }`, `valibot { abortEarly: true }`, ajv default, `typebox .First()`, `ours { first: true }`; arktype has none and is absent from that row).
3. **Name the engine, and only time payloads whose verdicts were proven identical.** Split results into *run-time code generation* (ajv, typebox TypeCompiler, zod default, arktype default: all call `new Function`) and *no-eval* (valibot, typebox Value.Check, zod and arktype under CSP/jitless, ours check); report schema construction or compile time as its own number, not amortised away. Run this verdict check as a precondition of every benchmark run and refuse to time a scenario with a disagreement. The corpus stays inside the agreed zone found in semantics.md: ASCII strings near length bounds, integers within ±(2**53 − 1), finite numbers only, no `undefined` values, absent keys omitted, no arrays where objects are expected, no built-in formats (use explicit regexes), no coercion, no Date objects.
