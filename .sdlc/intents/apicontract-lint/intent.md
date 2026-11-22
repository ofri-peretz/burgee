# Intent — `apicontract lint`: a team's standards and governance rules, checked on the contract and the code that implements it

> The program's `lint` row ([`../apicontract/intent.md`](../apicontract/intent.md), "only on pull")
> and its governance requirements R-BL1–R-BL9 ([`../apicontract/spec.md`](../apicontract/spec.md)).
> The pull arrived on 2026-11-22: the owner asked for "linting for standards, applying linting rules and
> governance rules on contracts". Pairs with [`../apicontract-diff-decisions/`](../apicontract-diff-decisions/):
> lint checks the *form* of a contract, diff checks the *change*, decision markers record the *intent*.

**Status:** draft · **Opened:** `2026-11-22` · **Owner:** `@ofri-peretz` · **Lane:** `ac-lint` (new)

---

## What is wanted

`apicontract lint`, one command, three kinds of rule, all reported the same way (a pointer, a
`fix:` line, SARIF, `--json`):

1. **Standards on the contract (form).** Rules a machine can decide fully, on any format the model
   reads (OpenAPI, Swagger 2, JSON Schema events, AsyncAPI, MCP):
   - naming: camelCase properties, `operationId` shape, event names `noun_verb`;
   - documentation: every operation, property and error described;
   - house conventions: money as an integer named `*Cents`, one error shape for every 4xx/5xx,
     no untyped `object`, every enum closed or marked open;
   - spec hygiene: unused components, dangling `$ref`s, examples that fail their own schema.
2. **Governance on the contract (policy).** Rules about what a team allows, not how it spells it:
   - every operation tagged `payments` declares `security`;
   - every public operation has an owner (`x-owner`) and a stability level;
   - a `deprecated` member carries an `x-sunset` and an `x-replaced-by` (the markers from
     `apicontract-diff-decisions`);
   - an event schema sets `additionalProperties: false` (strict on what we send).
3. **Governance on the code, through the contract (R-BL3).** A rule selects code by what the
   contract says about it, not by file glob: "every handler of an operation with `security: admin`
   calls the audit hook", "every MCP tool validates its input". The contract map from `gen`
   (`apicontract.map.json`, R-BL1, shipped) resolves the operation to its handler. No incumbent
   does this; Spectral, Redocly and vacuum stop at the YAML.

Rules are data, in a plugin's `rules` key (R-EX6), so a team or its agent writes its own the same
way it writes a generator, proven by the same conformance suite. Built-in rulesets ship as
plugins too: `recommended` (form), and the strict house set as an opt-in example.

**Keep the team's existing standards.** `lint` reads `.spectral.yaml` (Spectral's core functions
and `given`/`then` JSONPath rules) and Redocly's `lint` config, so adopting it changes no rule
anyone already enforces (R-BL9). A ruleset feature it cannot carry is a finding with a `fix:`,
never a silent skip.

**Adopt without an ignore file (R-BL6).** With `--since <ref>`, rules apply in full to what was
added or changed since that ref; untouched legacy members are checked by a looser ruleset (or
none). The first run on an old contract reports nothing on code nobody changed.

## The rules this follows

From the Snappy Agent Playbook (November 2026), adopted by the owner on 2026-11-22 for this work.
Each becomes a requirement, not a slogan:

- **Code decides facts; people decide meaning.** A rule is admitted only if a program can decide it
  the same way every time. "Is this name clear?" is a judgment, so it is not a lint rule; it goes to
  the `contract-change-review` playbook. A rule that needs a model to decide is rejected at
  `conformance`.
- **Put each rule where it can't be forgotten.** `lint` is the automatic check for a contract's
  form (the playbook's Tripwire). `apicontract lint --since origin/main` in the pre-push hook is
  the step before push (Gatekeeper). The contract itself holds the shape (Contract). A team's notes
  file carries one line that points at the ruleset, never the rules themselves (Compass). Judgment
  calls live in a how-to opened only when needed (Playbook).
- **Error messages say how to fix it.** Every finding has a `fix:` line; `conformance` already
  fails a rule that refuses without one.
- **The same mistake twice becomes a check.** `apicontract plugin new --kind rules --from <finding>`
  scaffolds a rule, its sample and its test from a mistake a reviewer flagged, so turning a review
  comment into a rule is one command.
- **Nobody changes the rules in the same change they're judged by.** `lint` loads the ruleset
  from the base ref (`--rules-from`, default the merge base). A PR that loosens a rule and breaks
  it in the same change is judged by the rule as it was; the ruleset change is reported for its
  owner (CODEOWNERS on the ruleset file is the recommended setup, outside `lint`).
- **New checks warn first; useless checks get removed.** A rule added to a ruleset runs at `warn`
  for a window the team sets before it can be `error`. `lint --stats` counts each rule's catches
  across runs; a rule that caught nothing in three months is listed for removal.
- **Ask for proof, not "done".** `lint` prints what it checked and what it did not (rules not
  carried from `.spectral.yaml`, members skipped by `--since`), never only "0 problems".

## Why now

- Stage 1 of the contract pipeline (lint the form) is the one stage apicontract does not cover.
  Today a team still needs Spectral beside `gen --check` and `diff`.
- Decision markers (`x-change`, `x-sunset`) are only as good as the rule that requires them on a
  deprecated member. That rule is a lint rule.
- The model, adapters, contract map and conformance suite all exist. `lint` is a new command on
  shipped parts, not a new engine.

## Affected users and systems

- New: `packages/apicontract/src/lint-*.ts`, `command-lint.ts`, a `rules` key in the plugin
  schema and in `conformance`.
- `packages/apicontract/src/cli.ts`: `lint` joins `gen`, `extract`, `diff`; the planned `check`
  (call sites, Phase 7) stays separate.
- Teams running Spectral, Redocly CLI or vacuum in CI.

## Constraints

- Zero new dependencies. JSONPath for Spectral's `given` is a subset we implement and document;
  an expression outside it is reported, not guessed at.
- A rule never runs user code to decide (Spectral custom JS functions are reported as not carried,
  with the `fix:` to rewrite them as a `rules` plugin). Packages, never services.
- Severity is the team's: `error` fails the run, `warn` reports, `off` silences, per rule, in
  `apicontract.config.json`.
- Every finding names the rule, the pointer, and a `fix:` line. Code findings (kind 3) point at the
  handler line, with the spec location as the related location (R-BL7).
- Deterministic: same contract, same rules, same output bytes.

## Success criteria

- **Parity on what teams already run:** `spectral:oas` and Redocly's `recommended` rules each carried
  or reported as not carried, measured on the pinned corpus. Where both run, the same finding set,
  each disagreement explained in a file.
- **Speed:** faster than Spectral and vacuum on the corpus's largest documents (measured, not
  claimed).
- **Forwards-only:** on a corpus document with history, `--since` reports zero findings on
  unchanged members.
- **Code reach:** one kind-3 rule (audit hook on admin operations) proven on the NestJS and Hono
  generators' fixtures: fails when a handler skips the call, passes when it makes it.
- **Judged by the old rules:** a planted PR that loosens a rule and breaks it in one change fails.
- **Warn first, retire the idle:** `--stats` on a month of corpus runs lists per-rule catch counts,
  and a rule with zero is flagged.
- **Rules as data:** a rule written with `plugin new --kind rules` passes `conformance` and runs
  in `lint` with no change to apicontract.

## Defaults taken

- `lint` with no config runs `recommended` (form only) at `warn`; nothing fails until a team
  sets a rule to `error`.
- The house conventions (cents, error shape, `x-owner`) ship off, as an example ruleset a team
  copies, because they are one team's policy, not a standard.

## Rejected

- **Wrapping Spectral.** A dependency and a runtime that executes rule JS; it also cannot reach
  code. Reading its ruleset format keeps the team's rules without either.
- **Lint rules for code as an ESLint plugin only.** ESLint sees a file, not the operation it
  implements. R-BL4 still emits scoped overrides for oxlint/ESLint, as a complement.
- **One giant default ruleset.** Opinionated rules on by default make the first run red and push
  teams to an ignore file, which is what R-BL6 exists to avoid.
