# Design — `apicontract lint`

Intent: [`intent.md`](./intent.md). **Status:** approved.

---

## Requirements

**The command**

- **R1.** `apicontract lint [spec…]` reads each input through the existing adapters (OpenAPI 3.x,
  Swagger 2, JSON Schema, AsyncAPI, MCP) and runs the configured rules. With no argument it lints
  the config's `input`.
- **R2.** Output: text grouped by file, `--json` (a flat list sorted by severity then pointer), and
  `--sarif`. Every finding carries `rule`, `severity`, `pointer`, `message`, `fix`. Exit 1 when any
  finding is `error`.
- **R3. Proof, not "done".** Every run ends with a coverage line: rules run, rules not carried
  (with ids), members skipped by `--since`, and inputs read. "0 problems" is never printed alone.

**Rules are data**

- **R4.** A plugin may contribute `rules: Record<string, Rule>`; `Plugin` in `host.ts` gains the
  key. A rule is `{ description, given, then, severity?, sample }`:
  - `given`: what to select. A selector over the **model** (`operation`, `payload`,
    `schema-member`, `parameter`, `event`) with filters (`tag`, `method`, `direction`, `security`,
    `x-*` extension equals), or a JSONPath into the source document (the R9 subset).
  - `then`: what must hold. One of the built-in functions (`truthy`, `falsy`, `pattern`, `casing`,
    `enumeration`, `length`, `schema`, `defined`, `undefined`, `xor`), each pure and total, or a
    `check(node, context) => Finding[]` that `conformance` proves deterministic.
  - `sample`: a document and the exact findings the rule returns on it (the static projection,
    like a generator's).
- **R5. Facts only.** `conformance` refuses a rule whose `check` is not deterministic on its sample
  and corpus (two runs, same bytes), or that does I/O (the check gets no `fs`, no `fetch`; a call
  through a stubbed global fails the rule). A rule never calls a model.
- **R6. Every finding says how to fix it.** `conformance`'s `fix-lines` rule extends to rules.
- **R7. The same mistake twice becomes a rule.** `apicontract plugin new <name> --kind rules
  [--from <finding.json>]` writes a rule, its sample (seeded from the finding's document and
  pointer when `--from` is given) and its test.

**Rulesets and severity**

- **R8.** `apicontract.config.json` gains `lint: { extends: string[], rules: Record<string,
  'error'|'warn'|'off'|[level, options]>, since?: string, warnFor?: string }`. Built-in rulesets:
  `apicontract:recommended` (form, all `warn`) and `apicontract:house-example` (cents, error shape,
  `x-owner`, all `off`, a copy-me example).
- **R9. Keep the team's standards.** `extends` may name a `.spectral.yaml` / `.spectral.json` or a
  `redocly.yaml`. Spectral `given`/`then` rules with core functions are carried; the JSONPath subset
  is root, child, wildcard, recursive descent, bracket keys and simple filters (`?(@.x == 'y')`,
  `?(@.x)`). A rule that is not carried (custom JS function, JSONPath outside the subset,
  `spectral:asyncapi` rules on a format we do not read) is a finding `rule-not-carried` with its
  `fix:`, listed in R3's coverage line, never skipped silently.
- **R10. New rules warn first.** A rule whose id is absent from the base ref's resolved ruleset
  runs at `warn` whatever its configured level, until `lint.warnFor` (default `"14d"`, by the date
  of the commit that added it, read through git) has passed. Then its configured level applies.

**Judged by the old rules**

- **R11.** When `--rules-from <ref>` is given (CI default: the merge base with `origin/main`, via
  `--rules-from merge-base`), the config and every ruleset file are read at that ref. Changes to
  them in the working tree are reported as `ruleset-changed` (info) with their diff, and not
  applied. Without a git repository, the working tree is used and the coverage line says so.

**Forwards-only adoption**

- **R12.** `--since <ref>` runs the full ruleset only on members that `diff` reports as added or
  changed between `<ref>` and the input (any verdict), reusing `compareContracts`. Untouched
  members run `lint.legacy` (default: no rules). The coverage line counts the members skipped.

**Retire idle rules**

- **R13.** `--stats <file>` reads, updates and writes a JSON file of per-rule counts: runs, findings,
  last finding date. `apicontract lint --stats <file> --idle 90d` lists rules with no finding in
  90 days as `rule-idle` (info). The file is meant for a CI cache; nothing else reads it.

**Governance on code (kind 3)**

- **R14.** A `given` with `implementation: true` selects, for each matched operation, the handler
  symbol from `apicontract.map.json` (R-BL1). Built-in `then` functions for code: `calls(name)`,
  `validates-input`, `returns-error-shape(ref)`, checked statically with the TypeScript API
  already used by `extract`. A finding's location is the handler line; the spec member is its
  related location (R-BL7).
- **R15.** Until the map records the user-owned handler symbol (today it records generated
  symbols), kind-3 rules report `map-has-no-handler` with the `fix:` to regenerate with a
  server target. Kind 3 ships after R1–R13.

## Design

**Engine.** `lint-engine.ts`: resolve the ruleset (R8–R11), select nodes (`lint-select.ts`: model
selectors and the JSONPath subset), apply functions (`lint-functions.ts`), collect findings. Rules
run per input, in rule-id order; findings are sorted by file, pointer, rule. No rule sees another
rule's output.

**Model selectors first.** A model selector works the same on OpenAPI, AsyncAPI, JSON Schema
events and MCP, because every format already reduces to `Contract`. JSONPath is for carried
Spectral rules, which are written against the raw document.

**Files.** New `command-lint.ts`, `lint-engine.ts`, `lint-select.ts`, `lint-jsonpath.ts`,
`lint-functions.ts`, `lint-spectral.ts` (ruleset reader), `lint-redocly.ts`, `lint-stats.ts`,
`plugin-lint-recommended.ts`, `plugin-lint-house.ts`; changed `host.ts` (`rules` key), the
conformance suite (rule rules), `command-plugin.ts` (`--kind rules`, `--from`), `run-config.ts`
(`lint`), `cli.ts` (`lint` replaces its `planned` entry).

**Order of work** (each a PR, each green on its own):

1. Engine, model selectors, built-in functions, `recommended`, text/`--json`/`--sarif`, coverage
   line (R1–R3, R8 minus `extends` files).
2. `rules` plugin key, conformance, `plugin new --kind rules --from` (R4–R7).
3. JSONPath subset and the Spectral reader, then Redocly (R9), measured against `spectral:oas`
   and Redocly `recommended` on the corpus.
4. `--rules-from` and warn-first (R10, R11).
5. `--since` (R12) and `--stats` / `--idle` (R13).
6. Kind 3 (R14, R15), after the map records handlers.

## Verification

- **One command per step:** `npx vitest run packages/contractdiff/src/lint-*.test.ts`.
- **Each rule and requirement proven to fail on the unfixed state:** every built-in rule's
  `sample` is its test (conformance runs it); R10, R11 and R12 each have a planted git history
  in a temp repo (the `install-graph-lock` pattern) with the exact expected findings.
- **Parity:** `benchmarks/apicontract/lint-parity.ts` runs Spectral (`spectral:oas`) and Redocly
  (`recommended`) and ours over the pinned corpus; the result file lists each rule as carried,
  agreeing, disagreeing (with the reason), or not carried. Run in the benchmark job, not pre-push.
- **Speed:** the same script times all three on the 20 largest corpus documents; the README cites
  the result file, not a number in prose.

## Rejected alternatives

- **Wrapping Spectral or vacuum.** A dependency (zero-dependency rule) and a rule runtime that
  executes arbitrary JS. Reading the ruleset keeps the team's rules without either.
- **Full JSONPath (or JSONPath-Plus).** The corpus's rulesets use a small subset; a full engine is
  a dependency or weeks of work for expressions nobody writes. Outside the subset is reported.
- **A model in the loop for "is this a good name?".** Judgment is not a lint rule (intent:
  "code decides facts"). It belongs in the review playbook.
- **Warn-first by a run counter.** Counting runs needs shared state; the commit date of the rule's
  addition is already in git and the same for everyone.
- **ESLint as the code-rule engine.** It sees files, not operations. R-BL4's scoped overrides
  remain a complement.

## Out of scope

- Autofix (`--fix`). Findings carry `fix:` text; rewriting a spec is a later intent.
- A hosted rules registry. Rulesets are npm packages or files.
- Non-TypeScript implementations for kind 3.
