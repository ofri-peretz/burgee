# Intent — `validator`: a validator that beats Zod and ajv on features, value and latency

> Stage 1 artifact of the AI-native SDLC. Opened 2026-11-11 from two owner directions given on the
> `apicontract` review: we do not use Zod and build our own validator
> ([`D-20261111-apicontract-own-validator`](../../decisions/D-20261111-apicontract-own-validator.md)),
> and it has a code-first authoring API, which makes it a product of its own
> ([`D-20261111-layer-bar`](../../decisions/D-20261111-layer-bar.md)). `validator` is a working
> name; the name is chosen after the capabilities are implemented.

**Status:** draft (the owner's go-ahead is given, [`D-20261113-apicontract-build-go-ahead`](../../decisions/D-20261113-apicontract-build-go-ahead.md); it becomes approved when its `spec.md` is written) · **Opened:** `2026-11-11` · **Owner:** `@ofri-peretz`

**Proposed name, not accepted and not reserved:** `loadline` — the line painted on a ship's hull
that marks how far it may be loaded; what is over the line does not sail. Read 2026-11-11
(`curl https://registry.npmjs.org/<name>`): `loadline`, `load-line` and `loadlines` are free on npm;
the `@loadline` scope belongs to someone else. Also free: `scantling`, `leadline`, `truemark`,
`gunwale`. Taken: `muster`, `touchstone`, `assay`, `plumbline`, `proofmark`, `caliper`.

---

## What is wanted

One validator with two front doors over one engine:

- **Code-first.** Schemas written in TypeScript, the static type inferred from the schema, as Zod,
  Valibot and ArkType users write them today.
- **Contract-first.** The same validators compiled ahead of time from a contract (OpenAPI, JSON
  Schema, AsyncAPI, MCP) by `apicontract` ([`spec.md` § R-SC](../apicontract/spec.md)).

It implements Standard Schema and Standard JSON Schema, so it works wherever Zod works with no shim.
It beats **both Zod and ajv**, the two validators teams run today, on **features, value and
latency** (owner, 2026-11-12). Each of the three is a set of rows in the table under Success
criteria, measured with the same script, subject and machine; until a row is won the losing number
is published and the claim is not made. Valibot, ArkType, TypeBox and typia are read beside them
and published too; they are context, not the bar.

## Why now

Read 2026-11-11: `curl https://api.npmjs.org/downloads/point/last-week/<pkg>`,
`curl https://registry.npmjs.org/<pkg>/latest` (`dist.unpackedSize`, `dependencies`) and
`gh api repos/<owner>/<repo>` (`open_issues_count`, which includes pull requests).

| Package | Weekly downloads | Latest | Unpacked | Runtime deps | Open issues + PRs |
| :-- | --: | :-- | --: | --: | --: |
| ajv | 519,401,290 | 8.20.0 | 1.03 MB | 4 | 408 |
| zod | 453,993,805 | 4.6.7 | 6.15 MB | 0 | 122 |
| @sinclair/typebox | 161,310,650 | 0.34.52 | 1.91 MB | 0 | 1 (shared repo) |
| valibot | 32,312,540 | 1.5.0 | 1.87 MB | 0 | 241 |
| typebox | 17,063,753 | 1.4.6 | 1.57 MB | 0 | 1 |
| arktype | 3,033,181 | 2.2.9 | 0.35 MB | 3 | 240 |
| typia | 511,313 | 15.3.1 | 6.68 MB | 3 | 4 |
| @standard-schema/spec | 191,775,701 | 1.1.0 | 0.02 MB | 0 | — |

- The audience is the largest in this repo's reach, and `@standard-schema/spec` at 192M a week means
  frameworks now accept any conforming validator, so switching no longer needs framework support.
- The owner's direction is the reason this intent exists. The gap was then read, below.

### Where Zod is beatable, read 2026-11-12

Zod's tracker: 105 open issues and 480 closed as not planned. Read with
`gh api --paginate 'repos/colinhacks/zod/issues?state=open'` and
`gh api 'search/issues?q=repo:colinhacks/zod+is:issue+is:closed+reason:not-planned+sort:reactions-%2B1'`,
ranked by 👍. Declined requests count as much as open ones (PRINCIPLES rule 7).

| Gap | Evidence (issue, 👍, state) | What "better" is |
| :-- | :-- | :-- |
| Stop at the first error | #1403 +50 declined (60 comments); #3884 +42 open | An abort-early mode, per parse |
| Refinements that do not run, or land on the wrong path | #2524 +33, #3919 +31, #2440 +26, #3774 +25, all declined; `.when()` #3874 +19 declined | Cross-field rules that always run and report at the field, the case every form needs |
| Discriminated unions | #1768 +30 and #1618 +18 declined; #1868 +10 open | `pick`/`omit`/`partial` on them, nested ones, a nested discriminator |
| Object shape controls | #2623 +68 declined (record with enum keys is partial); #2893 +65 open (all fields nullable); #2062 +29 open (strict by default, deep); #2879 +28 declined and #2732 +8 open (readonly); #475 +11 open | These as one-liners, and strictness as a setting |
| Formats people ask to add | lat/long #2600 +55, phone #3378 +45, cron #4239 +13, all declined; Temporal #5441 +15, RFC 9557 #4016 +10, BIC #6615 open | A format is a plugin: data, no maintainer needed. The clearest "support X too" signal here |
| JSON Schema in and out | Six open bugs filed 2026-11-06 to 2026-11-09 alone (#6741, #6742, #6743, #6746, #6749; Gemini `anyOf` #5807): keywords dropped silently, values rejected | An exact round trip, with every loss reported (Z10) |
| Type-level cost and errors | #2663 +36 declined (43 comments, "not assignable to ZodType"); #4611 "excessively deep"; isolated declarations #3751 +13 declined; inference bugs #2325 +18, #2909 +14, #3079 +12 declined | Plain inferred types, isolated-declarations safe (Z7) |
| Standard Schema path | #6610 open: `~standard.validate()` runs async transforms and refinements twice | One pass (Z8) |
| Release safety | #6106 open (a human gate before publish); CVE-2023-54404 in v3, #6653 +8 open | Provenance and a gated release, which this repo already has |

### Where ajv is beatable, read 2026-11-12

ajv's tracker: 304 open issues, read with
`gh api --paginate 'repos/ajv-validator/ajv/issues?state=open'`, ranked by 👍. Its last release and
last commit are both 2026-04-24.

| Gap | Evidence (issue, 👍) | What "better" is |
| :-- | :-- | :-- |
| Types that are wrong or absent | #1664 +36 (optional must be nullable), #2163 +31 (nullable not inferred), #2091 +11 (validators as type guards) | The type comes from the schema, and a passing check narrows it |
| ESM | #2209 +32 (standalone code is not ESM-compatible), #2015 +13 (no pure-ESM build) | ESM and CJS from one build; generated validators are ESM |
| `new Function` | #2527 +12 (separate it from code generation); React Native and Hermes, #1945 +8 and #1923 +7 | No `eval` at run time: validators are generated ahead of time by the CLI |
| Dependencies | #2658 +9 (CVE-2026-16221 in `fast-uri`), #2660 +6 | No dependencies |
| Standard Schema | #2605 +6 | Implemented (Z8) |
| OpenAPI keywords | #2003 +5 (`discriminator.mapping`), #2097 +5 (`readOnly`) | First-class, since the contract is the input |

Two cautions. The counts are tens of 👍 on a package with 454M installs a week: Zod is healthy, and
these are specific gaps, not a vacuum. And the two things most likely to move a team, speed and
type-check cost, are not in a tracker at all; they are Z3, Z4, Z5 and Z7, still to be measured.

### Zod's numbers, read 2026-11-12

`npx tsx benchmarks/validator/baseline.ts <workdir>`: one order schema (nested object, array of
objects, enum, optional, two regexes, a discriminated union) written once per library, the same two
payloads through each. Node 24.13.0, Apple M4 Pro; the `tsc` columns of this first table are TypeScript 5.9.3. **The machine was loaded (load
average 185)**, so every time is an upper bound and only the ratios between rows are worth reading;
bundle bytes and instantiations do not depend on load. Re-read on a quiet machine before any claim.

| Library | Valid / s | Invalid / s | Build ×500 | Bundle, min+gzip | `tsc` instantiations ×500 | `tsc` check |
| :-- | --: | --: | --: | --: | --: | --: |
| **zod 4.6.7** | **1.28M** | **0.75M** | **48.4 ms** | **27,454 B** | **332,209** | **1.25 s** |
| valibot 1.5.0 | 0.94M | 0.64M | 1.8 ms | 2,485 B | 1,537,716 | 5.45 s |
| arktype 2.2.9 | 11.63M | 0.19M | 109.6 ms | 48,069 B | 5,589,780 | 5.07 s |
| @sinclair/typebox 0.34.52, compiled | 18.55M | 11.74M | 17.1 ms | 22,880 B | 325,056 | 1.36 s |
| ajv 8.20.0 | 11.18M | 7.98M | 592.9 ms | 38,819 B | — | — |

The same fixture under each supported TypeScript (second run the same day, load average 98; each
version installed on its own, its own `tsc --extendedDiagnostics`):

| Library | Instantiations ×500: 5.9.3 | 6.0.3 | 7.0.2 | Check time: 5.9.3 | 6.0.3 | 7.0.2 |
| :-- | --: | --: | --: | --: | --: | --: |
| **zod 4.6.7** | **332,209** | **332,209** | **331,710** | **1.22 s** | **1.33 s** | **1.00 s** |
| valibot 1.5.0 | 1,537,716 | 1,537,732 | 1,527,451 | 5.85 s | 5.42 s | 3.37 s |
| arktype 2.2.9 | 5,589,780 | 5,589,780 | 5,466,076 | 7.45 s | 5.87 s | 2.12 s |
| @sinclair/typebox 0.34.52 | 325,056 | 325,056 | 325,056 | 1.50 s | 1.45 s | 0.87 s |

Instantiations are a property of the library's types, not of the compiler: identical on 5.9 and
6.0, and within 2% on 7.0. TypeScript 7 checks the same work faster (1.2 to 3.5 times here) and in
about 40% less memory, so the ranking holds on every version and the gap in seconds narrows. That
second run also moved ArkType's runtime numbers by a factor of three (11.6M to 3.7M valid a second)
while its instantiation count did not move at all, which is why timings from a loaded machine are
not quoted as claims.

What it says:

- **Zod leads none of the four.** TypeBox's compiler is about 14 times faster, Valibot is 11 times
  smaller and builds 27 times quicker, and TypeBox costs slightly fewer instantiations. So beating
  Zod on Z3, Z4, Z5 and Z7 is a reachable bar: one library here already clears all four.
- **Nobody leads all four.** The fast ones (TypeBox, ajv, ArkType) carry 23 to 48 KB and compile with
  `new Function`; the small one (Valibot) is the slowest and the costliest to type-check after
  ArkType. An engine that is fast, small and cheap to type-check at once is the open ground.
- **Zod is cheap for `tsc`.** Its 664 instantiations per schema are the hardest of its numbers to
  beat; Valibot spends 4.6 times as many and ArkType 16.8 times.
- **So the numbers are the floor, not the reason to switch.** People choose Zod for its API and
  what plugs into it. The reason to move is the table above this one, on top of numbers that win.

Limits of this reading: one schema shape; TypeBox and ajv return a boolean where Zod, Valibot and
ArkType also build an error report, which flatters the first two on the invalid payload; and it is not yet checked whether Zod's own fast path uses `new Function`, which decides
what a CSP-safe default is compared against.

## Affected users and systems

- **Primary:** TypeScript teams validating API input, and coding agents that write schemas and read
  validation errors.
- **`apicontract`:** its runtime-validation package (`apicontract-schema`, R-SC) becomes the
  contract-first front door of this product, not a second validator.
- **Repo:** one new package and its docs page; a `compat-oracle` lane per incumbent; bench scripts
  under `benchmarks/validator/`; control bands for every leading metric; an oxmutate floor.

## Constraints

- No dependency outside this repo (PRINCIPLES rule 2). Zod, Valibot, ArkType, typia, TypeBox and ajv
  are never dependencies or peers; their test suites are vendored for grading only.
- Built on our own: no other validator inside it, and not a fork of one.
- Drop-in paths are graded by the incumbent's own suite through `compat-oracle`, with a control run
  and a pass rate that only rises (rule 3).
- No TypeScript compiler plugin or transformer needed at build time (typia's requirement).
- Several TypeScript versions are supported at once (owner, 2026-11-12): 5.9, 6.0 and 7.0 today.
  Every type-level metric is read under each of them, and a win on one version is not a win.
- Node `^20.19.0 || >=22.13.0`; ESM and CJS; works in browsers and edge runtimes (no `eval` or
  `new Function` on the default path, which CSP forbids).
- No public name, publish or claim before the capabilities are implemented and the metrics read.

## Success criteria

Ids are `Z1`–`Z16`, not `V…`: the family's floor ids already use `V`
(`scripts/run-evals.ts`). Every row's target is against **Zod 4 and ajv 8**, row by row, in three groups: features, latency
and value. Leading metrics run on every PR as
control bands; lagging metrics run weekly and at each phase end. `TBM`: to be measured before design.

| ID | Wins on | Metric | Kind | Definition | Baseline: Zod | Baseline: ajv | Target |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Z1 | Features | Suite parity | Leading | Share of the incumbent's own tests passing through its drop-in façade | — (reference) | — (reference) | 100% of the claimed subset of each |
| Z2 | Features | JSON Schema conformance | Leading | JSON-Schema-Test-Suite 2020-12 pass rate | TBM (`z.fromJSONSchema`) | TBM | > both |
| Z8 | Features | Standard Schema | Leading | Standard Schema and Standard JSON Schema conformance cases passing | TBM | 0 (not supported, #2605) | 100% |
| Z10 | Features | Lossless export | Leading | Refinements and transforms dropped silently on export to JSON Schema | TBM (`z.toJSONSchema`) | — | 0 |
| Z15 | Features | Requests Zod left open | Leading | Of Zod's 20 most-upvoted open or declined requests, the share that work here, each with a test | 0 of 20 by definition | — | ≥ 15, and the rest refused in writing |
| Z16 | Features | Requests ajv left open | Leading | Of ajv's 10 most-upvoted open requests, the share that work here, each with a test | — | 0 of 10 by definition | ≥ 8, and the rest refused in writing |
| Z3 | Latency | Throughput | Leading | Validations per second, valid and invalid payloads, median of 5 | 1.28M valid, 0.75M invalid | 11.18M valid, 7.98M invalid | > both |
| Z4 | Latency | Schema construction | Leading | Time to build the bench schema 500 times (for ajv, to compile it) | 48.4 ms | 592.9 ms | < both |
| Z7 | Latency | Type-check cost | Leading | `tsc` instantiations and check time on 500 copies of the bench schema, each with its inferred type, under every supported TypeScript | 332,209 instantiations on 5.9 and 6.0, 331,710 on 7.0 | — (infers no type) | < Zod on each of 5.9, 6.0 and 7.0 |
| Z5 | Value | Bundle bytes | Leading | Min+gzip of the bench schema and its check, bundled and tree-shaken | 27,454 B | 38,819 B | < both |
| Z6 | Value | Install size and deps | Leading | Unpacked bytes and runtime dependencies | 6.15 MB, 0 deps | 1.03 MB, 4 deps | < both; 0 deps |
| Z9 | Value | Error quality | Leading | Share of errors carrying a JSON Pointer, the keyword and a `fix:` line | TBM | TBM | 100%, > both |
| Z11 | Value | Agent authoring | Lagging | Eval: schemas an agent writes correctly in one turn, and errors it repairs in one turn | TBM | TBM | > both |
| Z12 | Value | Migrations | Lagging | Public repos that replaced Zod or ajv | 0 | 0 | Tracked weekly |
| Z13 | Value | Upstream tracking | Lagging | Days from an incumbent's release to its suite re-graded | — | — | ≤ 7 |
| Z14 | Value | Fix time | Lagging | Median days from an accepted issue to its release | TBM | TBM | < both |

**What the latency rows ask for.** ajv is 9 times faster than Zod because it compiles each schema
with `new Function`, and it pays 593 ms to do that 500 times. Beating both Z3 and Z4, with no `eval`
(a constraint above), points one way: validators generated ahead of time. `apicontract gen
validator` writes the specialised code at build time, so there is nothing to compile at start-up,
no compiler in the bundle, and the check runs as fast as compiled code. Schemas written by hand in
TypeScript run on an interpreter by default; whether that path alone can pass ajv on Z3 is the
first thing design has to measure, and if it cannot, the claim against ajv is made for generated
validators only and says so.

Done when every leading row holds on `main` against both, and the first lagging readings are
published.

## Open questions

- ~~Which gap does Zod actually leave?~~ Answered 2026-11-12 from Zod's own tracker
  ([`D-20261112-validator-gaps`](../../decisions/D-20261112-validator-gaps.md)); the table is in Why
  now. Speed and type-check cost are metrics, not questions.
- **How much of Zod's API is the drop-in subset** Z1 claims?
- **Where does it land relative to `apicontract`'s phases?** `apicontract` generates it in its Phase 2, so its contract-first side has to exist by then.
- **Does it need a Quint model?** Likely not (stateless), unless async refinements or streaming
  validation come into scope.
