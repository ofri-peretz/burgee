# Review — `apicontract` intent, roadmap and skeleton, 2026-11-11

Intent: [`intent.md`](./intent.md) · Design: [`spec.md`](./spec.md) · Roadmap:
[`roadmap.md`](./roadmap.md). **Status:** review finding, for the owner. Nothing here changes a
status; the Design→Build accept is the owner's.

Read: every file in this folder except `comparison.md` (headings only) and the two `.qnt` models
(not run), plus `packages/apicontract` on `main` and PRs #1486 and #1487. Every market number below
was re-read on 2026-11-11 with the commands in [`landscape.md`](./landscape.md) and `gh api`.

## Correction, 2026-11-12

This review read the product from `intent.md` as it stood: a contract tool that leads with `diff`
and `explain`. The owner's definition is a CLI that turns specs into generated code through plugins
([`D-20261112-apicontract-is-a-generator`](../../decisions/D-20261112-apicontract-is-a-generator.md)).
So two things below are wrong and are withdrawn: the verdict row that files the NestJS generator,
the runtime validator and the plugin kit under "no evidence, park", and recommendation 3's list of
what to park, for R-EX, R-NE, R-SC and R-TE's generate side. What stands: F1, F2, F4 and F6, the
market readings, and F5's narrower point that those pieces still have no demand reading, which is
now owed as a measurement, not a reason to park them.

## Verdict

One part of this is something the JS/TS community demonstrably needs today, one part is a
reasonable bet that has not been tested, and the rest is supply without demand evidence. The
roadmap builds them in the wrong order, and the spec grew from a four-command CLI to roughly 25
packages in one day without a single new measurement.

| Piece | Need | Evidence | Read |
| :-- | :-- | :-- | :-- |
| `gen`, a TS 7-safe drop-in for openapi-typescript | **Proven, urgent, contested** | 16.7M installs a week; author told users to migrate and named no successor (#2874); TS 7 crash open with 58 👍 (#2841); TypeScript's `latest` tag is 7.0.2; hey-api crashes on TS 7 too (#4235, 46 👍, no release since 2026-09-30) | The only piece with users asking |
| `diff` for OpenAPI | Moderate | ~331k a week on dead tools (openapi-diff 242k, Optic 89k); but oasdiff shipped 1.36 and 1.37 in the last four days and Redocly (4.3M a week) now ships a diff | A migration target, not a vacuum |
| `diff` for MCP and code-first | **Unknown** | The cited entrants have no users: apibreak 9 a week, specdrift 77. That shows supply | SC4 (SC10 since 2026-11-12) is the probe, and it needs no product |
| `explain` and the agent claim | **Unknown; this is the core bet** | A5–A7 have no reading. Two eval cases written, none run | Cheapest thing here to test |
| `check` (static call sites) | Plausible, unoccupied | No free static tool exists; no demand count either | Keep at Phase 4 |
| NestJS generator, runtime validator, synthetic checks, contract-aware lint, plugin kit, per-protocol CLIs | **No evidence** | Each rests on "no tool does this" | Park |

## Findings

### F1. Build started before Design was accepted

`packages/apicontract` merged in #1487 on 2026-11-07 with no review, while the intent that
justifies it (#1486) is a draft, in conflict with `main`, and `Status: draft`. Rule 3 of the
working agreement puts a human accept between the two. The damage is small (private, four stubs),
but the stubs' `fix:` lines point at `.sdlc/intents/apicontract/roadmap.md`, a path that does not
exist on `main`, and the skeleton declares four commands where R5 lists six.

### F2. "Every question is closed" is not true

The intent's Open questions section says so, while the question the whole product rests on (do
agents do better with it: A5–A7) is unmeasured, D1–D4 are unread, and the name is undecided. Phase
0's own exit ("baselines in `bench/history/`; a name the owner approved") is not met.

### F3. The roadmap puts the untested bet ahead of the proven need

Phase 1 is `explain` + `diff`; Phase 2 is `gen`, with the note that "the window closes". It is
closing now: `openapi-typesafe` was created 2026-11-03 and is at `1.0.0-rc.5` today, with no
compiler API, a compatibility report over 1,800 schemas, a migration tool and npm provenance. It
has 1,556 installs a week and 10 stars, so nothing is decided, but it is doing Phase 2 while we
plan Phase 1. hey-api's maintainer has offered a plugin twice on #2841. The kill rules name
upstream and hey-api and never mention the fork.

Note what the author gave as the reason for refusing a handover: supply-chain trust. That is the
buying criterion for a successor, and it is the one this family is built for (zero outside
dependencies, provenance).

### F4. The second kill rule cannot fire in time

"A5–A7 show no gain at the Phase 2 exit" is read after `explain`, `diff` and `gen` are all built.
The baseline arm needs no tool, and the tool arm needs only an `explain` prototype over one
OpenAPI file (`benchmarks/apicontract/explain-baseline.ts` already inlines `$ref`s). Two cases is
also too few to read; the playbook's floor is 20.

### F5. Scope grew by assertion, against rules 7 and 13

Between 2026-11-06 and 2026-11-07 the spec added R-EX (plugin API, scaffolder, conformance kit),
R-TE (three capabilities per technology, four waves), R-NE, R-SC, R-SY, R-BL and X-1. None carries
a "support X too" count, a hand-rolling count, or any reading. Rule 7 says which layers owe an
extension surface "is measured, not assumed"; rule 13 says a gap is "checked before it is
claimed". "No tool does this" appears as the justification for five of them.

### F6. The files contradict each other

| Where | Says | Against |
| :-- | :-- | :-- |
| `spec.md` Rejected alternatives | "One package per spec type" and "A separate core library package now" are rejected | The Packages table adds `@interlace/contract-model`; X-1 ships one CLI per protocol |
| `spec.md` Rejected alternatives | No SDK or MCP-server generation | R-TE1 generates NestJS servers, MCP servers and fetch/axios/TanStack clients |
| `roadmap.md` | Phase 6 folded, `guard` absorbed | `metrics.md` §5 still measures `apicontract-guard`; `landscape.md` says "`guard` is Phase 6 with a cut rule" and "Lint … Phase 6 only"; R-Q4 puts `guard.qnt` in Phase 5 |
| `spec.md` R6 | Four upstream bugs | `metrics.md` G7 lists six |
| PRINCIPLES rule 8 | No `<parent>-<thing>` names; each package leads with its own incumbent | Nine `apicontract-*` packages |
| `intent.md` Why now | New entrants "confirm the demand" | 9 and 77 installs a week |

### F7. What held up

The dated evidence is accurate: every figure re-read on 2026-11-11 is within a few percent or has
moved in the stated direction. The metrics file states baselines, targets and "losing numbers are
published". The Phase 0 `gen` baseline is real and reproducible. `oasdiff` on npm is a
`0.0.1-security` placeholder, so "no npm-native oasdiff" stands. The harbour fixture (an invented
API, so the eval measures reading and not memory) is the right design.

One caution on the headline number: openapi-typescript's weekly installs rose from about 6M in
August to 16.7M now, after the maintenance notice. Installs are pinned CI traffic; they are an
audience size, not a count of people looking for a successor. The 👍 counts are the demand figure.

## Recommendation

1. **Run the two cheap probes before any more design.** (a) The agent eval: 20 cases on the
   harbour fixture, arm without the tool against an arm with a prototype `explain`. (b) SC4 (SC10 since 2026-11-12): diff
   the published `tools/list` histories of the ten MCP servers with a script. Each is days, and each
   either earns its phase or removes it. A positive SC4 (SC10 since 2026-11-12) is also a publishable finding (rule 11).
2. **Decide `gen` now, either way.** Lead with it (Phase 1, graded against openapi-typescript's
   own fixtures, published with provenance) or drop the drop-in claim and name `openapi-typesafe`
   as the path. Second place behind a fork that is already at rc.5 is the outcome to avoid.
3. **Cut the spec back to what has evidence:** the model, `gen`, `diff` for OpenAPI and JSON
   Schema, `explain`. Move R-EX, R-TE, R-NE, R-SC, R-SY, R-BL and X-1 to a parked list, each with
   the measurement that would reopen it.
4. **Repair the record:** reopen the Open questions honestly, add the fork to the kill rules,
   fix the F6 rows, and either land this folder on `main` or point the skeleton's `fix:` lines
   somewhere that exists.

## Owner decisions

- `gen` first, or not at all as a drop-in (recommendation 2). **Decided 2026-11-11: `gen` first**
  ([`D-20261111-apicontract-gen-first`](../../decisions/D-20261111-apicontract-gen-first.md)); F3 and
  the kill-rule gap are closed in [`roadmap.md`](./roadmap.md).
- Whether the skeleton stays on `main` while the intent is a draft (F1).
- The parked list (recommendation 3). **Owner direction 2026-11-11: the runtime validator is not
  parked.** We do not use Zod and build our own ([`D-20261111-apicontract-own-validator`](../../decisions/D-20261111-apicontract-own-validator.md)).
  The finding stands that its demand is unmeasured; the decision names the reading that is owed.
