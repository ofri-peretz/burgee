# Intent — `eslint-plugin-cli-floor`: the floor held statically

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md),
> step 3 of its order of work. The L side of every "R + L" requirement.

**Status:** review · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz

---

## What is wanted

A plugin in this repo, `packages/eslint-plugin-cli-floor`, built on `@interlace/eslint-devkit`,
with ten rules that hold the floor in code that may not even use the runtime layer:

| Rule | Floor | What it reports |
| :-- | :-- | :-- |
| `require-json-output` | O1 | a command registered without `--json` (or outside `withAgentLayer`) |
| `no-console-in-command` | O3 | `console.*` inside a commander `.action()` / yargs handler |
| `prefer-native-style-text` | O4 | `chalk`, `kleur`, `picocolors`, `ansi-colors` imports |
| `exit-code-constant` | E1 | a numeric literal passed to `process.exit` / `process.exitCode` / `exitOverride` |
| `no-process-exit-in-handler` | E1 | `process.exit` inside an action; return or throw instead |
| `no-help-on-runtime-error` | E2 | `showHelpAfterError(true)` / `showHelpOnFail(true)` or `outputHelp()` inside a `catch` |
| `require-command-example` | F3 | a command with no `.addHelpText('after', …)` / `.example()` |
| `env-option-documented` | V2 | an option that reads `process.env` in its default or coerce without `.env()` |
| `no-reserved-option-names` | V5 | an option named `help`, `version`, `json`, `schema`, `explain`, `no-color`, `agent` |
| `no-prompt-without-flag` | P1 | a `@clack/prompts` / `inquirer` / `prompts` call whose answer is not first sought in `options` |
| `deprecated-requires-replacement` | D1 | `.deprecated` / `deprecated: true` without a replacement reference |

(Eleven listed; ten is the floor. `no-prompt-without-flag` is the one most likely to
slip, being the hardest to detect precisely.)

## Why now

- **Static enforcement reaches CLIs the runtime never will.** commander and yargs
  together sit under hundreds of thousands of dependents; `withAgentLayer` reaches the
  ones that opt in, lint reaches every one that already runs ESLint.
- **Every rule above is an open issue turned into a check.** Reserved names: yargs
  #1323, #1864, #2199, #2064. Help on failure: yargs #2394. Prompts in agents: clack
  #533, #167. Examples missing: yargs #877, #1047. Env undocumented: yargs #1655, #1681.
- **The devkit is the fastest path.** `@interlace/eslint-devkit` gives `createRule`,
  LLM-formatted messages with `fix:` text, and the RuleTester conventions the eslint
  repo's quality gate expects. Fixtures come from the demo CLIs (intent 1), which the
  plugin can lint as real code.
- **It is the adoption wedge the umbrella names.** First run against `interlace-ui`
  and the eslint repo's scripts is the launch article; oclif/core #1644 (a CLI
  framework whose own lint fights itself) is the hook.

## Affected users and systems

- New `packages/eslint-plugin-cli-floor`, devDependency on `@interlace/eslint-devkit`,
  peer `eslint@>=9`.
- This repo's `eslint.config.mjs` adds the plugin's every rule at `error` (the
  `everyRule` helper makes that one line).
- `eslint-config-interlace` in the eslint repo gains a `cli` preset — the only change
  outside this repo.
- The docs site publishes one page per rule, the same shape as `eslint.interlace.tools`.

## Constraints

1. Rules detect commander and yargs idioms by name (`.action(`, `.command(`, `.option(`,
   `.env(`, `showHelpAfterError`, `showHelpOnFail`, `.fail(`), not by type information;
   the plugin must run without a TS program.
2. Every rule ships with valid and invalid fixtures for **both** hosts, and each
   message carries a `fix:` line in the devkit format.
3. Precision over recall: a rule that cannot tell a handler from a helper does not
   report. The six false positives this repo has already documented are the standard
   this plugin is held to.
4. Follows the eslint repo's `QUALITY_STANDARDS.md` and `PRE_PUBLISH_INTEGRITY_GATE.md`
   even though it lives here; the `main`/`files` mismatch that shelved the SARIF
   formatter gets a lock in this package from day one.

## Success criteria

- 10+ rules, each with ≥1 valid and ≥1 invalid case per host, all at 100% branch
  coverage as the eslint repo requires.
- First run on `interlace-ui` and `eslint/scripts/*.ts` reports ≥1 true finding each,
  and zero false positives after review — recorded in the PR.
- `npx eslint` on `examples/demo-cli-*` with the plugin is clean on the layered demo
  and reports the un-layered one.
- Published as `eslint-plugin-cli-floor` with provenance; `npm view eslint-plugin-cli-floor` shows
  the version `release.yml` tagged.

## Verified against `main` — 2026-09-09

Checked criterion by criterion on `61bd11b9`. **Zero of four met. The package does not exist.**
The status stays `review`: the intent and its design are complete and reviewed; not one line of
the plugin has been written.

`find` for `*cli-floor*` across the worktree returns exactly one path — this intent directory.
There is no `packages/eslint-plugin-cli-floor`, `eslint.config.mjs` references no `cli-floor`
rule, and `npm view eslint-plugin-cli-floor` is a 404.

- **10+ rules, each with a valid and an invalid case per host, at 100% branch coverage** — not
  met; zero rules.
- **A first run on `interlace-ui` and `eslint/scripts/*.ts` reporting ≥1 true finding each with
  zero false positives, recorded in the PR** — not met.
- **`npx eslint` clean on the layered demo and reporting on the un-layered one** — not met.
- **Published as `eslint-plugin-cli-floor` with provenance** — not met.

**This is the adoption wedge**, the one lane the roadmap says can earn users during the whole
build because it needs no runtime adoption, and it was re-sequenced on 2026-09-08 to run beside
wave 2. It has not started. It is also the mechanism behind the `migrate-import` autofix that
the "why the three bets can win" table leans on for bet 1.

**The recorded naming decision is corrupted** and no longer says anything: it reads *"Package
name is `eslint-plugin-cli-floor`. `eslint-plugin-cli-floor` is held by npm's security
placeholder (`0.0.1-security`) and cannot be published; `eslint-plugin-cli-floor` was free"* —
the same name in all three slots, evidently a rename that overwrote the two other names. The
real constraint it encoded is lost and must be re-established before the package is published.

## Open questions

None open. Decided at finalisation (2026-09-06):

- **Package name is `eslint-plugin-cli-floor`.** `eslint-plugin-cli-floor` is held by npm's
  security placeholder (`0.0.1-security`) and cannot be published; `eslint-plugin-cli-floor` was free on 2026-09-06 and says what the plugin holds. The rule prefix is
  `cli-floor/`.
- **`no-prompt-without-flag` ships in `strict` only** until a precision study on ten
  real CLIs shows fewer than one false positive per hundred prompt calls; the study is
  R6 in the design.
- **citty idioms are out** for v1; the anchors are commander and yargs only.
