# Intent — Localised for people, invariant for programs

> Stage 1 artifact. Opened from the next-wave ranking
> ([`next-wave-2026-10.md`](../../research/next-wave-2026-10.md)): a feature commander declined
> after three years and 31 comments, which only a framework that separates human and machine
> surfaces can offer safely.

**Status:** approved · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

---

## What is wanted

A program on burgee can speak its user's language on every **human** surface: usage errors,
hints, help headings, the prompt chrome `caique` draws, and the author's own descriptions. Its
**machine** surfaces never change with the locale: `--json`, `--schema`, `--mcp`,
`--format=agent`, error kinds, exit codes. A lock holds that split, so localising a program can
never break the agent or script driving it.

A language is a data pack registered through the plugin contract, not a fork and not a
dependency, and an agent can write one from the schema. The family ships English. Every other
language is a registration.

## Why now

- **Declined by the incumbent, with the engagement to show it was wanted.** commander #1801,
  localisation: **14 👍 and 31 comments, open from 2022 to 2025, closed as not planned**
  (`tracker-gap-analysis.md`). It is the most-engaged item in commander's not-planned record. yargs
  ships `y18n` and 29 locale files, and still has #2094 open for localised *descriptions*
  (`competitor-open-issues.md` §2).
- **The deferral condition was a guess, and the evidence is now in.** `cli-help-renderer/spec.md`
  R1 left `locale` "waiting for a first localised adopter". `PRINCIPLES.md` rule 7 says demand is
  measured in declined requests as well as open ones, and a 31-comment decline is that
  measurement. `seniority/intent.md` states the audience: *"Most of npm does not read English
  first."*
- **burgee is the framework that can do it without the trap.** A localised error message is
  harmless to a person and a parse failure to a script that greps it. burgee already separates
  the two: the `--json` envelope, error kinds (`clispec-conformance` R2) and exit codes are the
  machine contract, and prose is for people. A framework without that split cannot localise
  safely, which is a reason commander's decline was reasonable for commander.
- **`burgee/yargs` already localises**, through the vendored `y18n` and its 29 locale files
  (`packages/burgee/src/yargs/shim.ts`). The engine, the family's own surface, is the one that
  cannot.

## Affected users and systems

- **Every program on the engine**, whose human strings move into a catalog. English output is
  unchanged.
- `packages/burgee`: `failure.ts`, `usage.ts`, `help.ts`, `validate.ts`, `suggest.ts`,
  `definition.ts`, a new `messages.ts`, the plugin host.
- `packages/caique`: the native prompt chrome (`ask`, `decide`). The clack and inquirer façades
  keep their incumbents' English, because their suites grade it.
- **Unchanged by design**: `burgee/commander` (commander's strings are graded), `burgee/yargs`
  (y18n already), every machine surface.
- **Depends on** [`clispec-conformance`](../clispec-conformance/intent.md) R2 (error kinds, so
  no consumer needs the message text), and is scheduled after
  [`agent-lint-conformance`](../agent-lint-conformance/intent.md) and
  [`agent-skill`](../agent-skill/intent.md), which add human strings the catalog must carry.

## Constraints

- **English is byte-identical.** Every help and error snapshot in the repository is unchanged
  with no locale set. The catalog is a refactor for English, not a rewrite.
- **Machine surfaces are invariant under every locale**, held by a lock that runs the demo's
  whole surface matrix under a test locale and compares bytes.
- **Zero dependencies.** Locale resolution and plural selection use `Intl.Locale` and
  `Intl.PluralRules`, which Node ships.
- **No translation is shipped by the family.** Packs are data, the way themes and spinners are.
  A test pack exists to prove the mechanism, and it is not published.
- **The core byte budget holds.** English messages are inlined where they are used today. A
  registered pack is loaded only when the resolved locale is not English.

## Success criteria

1. `npx vitest run --root packages/burgee src/locale-invariance.test.ts` *(command corrected
   2026-10-18: the root config includes only `scripts/**/*.test.ts`, so the command as first
   written ran no test)*
   runs the demo's surfaces (`--json` success and failure, `--schema`, `--mcp` `tools/list`,
   `--format=agent`, exit codes) under `LANG=de_DE.UTF-8` with the test pack registered. It
   asserts each is byte-identical to `LANG=C`, and asserts that human help and errors differ.
2. Every existing help and failure snapshot passes unchanged.
3. `burgee check <pack>` validates a locale pack against its JSON Schema: unknown ids,
   placeholders that do not match, missing plural forms. It renders every message.
4. An eval case: an agent given the pack schema and one example writes a pack `burgee check`
   accepts, on every reading, with no reading near the 12-turn cap (max under 12). It runs weekly
   beside the plugin eval. *(Restated 2026-10-20,
   [D-20261020-locale-eval-criterion-restated](../../decisions/D-20261020-locale-eval-criterion-restated.md):
   "in one turn" was never the eval's unit, since the prompt's four calls floor `num_turns` at 5.
   The median half of the D-20261012-agent-eval-turn-budget bar is
   [`locale-pack-in-five`](../locale-pack-in-five/intent.md) S3's.)*

## Held at `approved` — 2026-10-18

**Criteria 1–3 are met. Criterion 4 needs a real eval reading before this can be stamped
`shipped`, and Batch 0 runs no paid evals.** The status stays `approved`.

| criterion | check | result |
| :-- | :-- | :-- |
| 1. every machine surface byte-identical under `de_DE`; help and errors differ | `locale-invariance.test.ts` (command corrected above) | 89 passed (with `locale.test.ts`, `messages.test.ts`, `check.test.ts`, `plugin.test.ts`) |
| 2. every help and failure snapshot unchanged | `help.test.ts -t "a localised description renders in the resolved locale"`, `schema.test.ts -t "carries the base language…"`; caique `locale.test.ts`, `messages.test.ts`; `npm run compat -- clack inquirer-core` | 5 passed, 31 skipped; 1 passed, 13 skipped; 24 passed; clack clack 16 / 16, inquirer-core 41 / 41 |
| 3. `burgee check <pack>` validates and renders a pack | `check.test.ts`; `scripts/locale-pack-schema-lock.test.ts` | the first run; 4 passed |
| 4. an agent writes a passing pack in one turn, weekly | `evals/cases/locale-pack-from-schema.json` on `evals.yml` | **no current weekly reading.** The 2026-10-15 run (`evals/history/2026-10-15-29362dc-38717342918.json`, 0 / 11, `model: null`) never executed: it hit the Claude usage limit. The PR-level `Agent Evals` job did pass the case on 2026-10-18, run 39160595966, in **6 turns**. "One turn" as written is not met (D-20261012-agent-eval-turn-budget measured a median of 7) |

**To ship:** first, Batch 1's fix, so a run that never executed is recorded as `not-run` and not
as a failure. Then one weekly run that executes and passes the case. Then restate criterion 4's
"one turn" to the bar D-20261012-agent-eval-turn-budget set, or meet it.

## Re-grounded on `main` — 2026-10-20

**Criteria 1–4 are met as written. The status stays `approved`, because two things are still
outstanding:**

- a **scheduled** weekly run that executes and passes the case (the next one is 2026-10-22);
- the minor that carries `locale-pack-in-five` R1–R2, published.

| criterion | check | result on 2026-10-20 |
| :-- | :-- | :-- |
| 1 | `npx --no vitest run --root packages/burgee src/locale.test.ts src/locale-invariance.test.ts src/messages.test.ts src/check.test.ts src/plugin.test.ts src/locale-pack-schema.test.ts` | 95 passed; `locale-invariance.test.ts` alone, 17 |
| 2 | `help.test.ts -t "a localised description renders in the resolved locale"`; `schema.test.ts -t "carries the base language of a localised description"`; caique `locale.test.ts messages.test.ts`; `npm run compat -- clack inquirer-core` | 5 passed, 31 skipped; 1 passed, 16 skipped; 24 passed; clack 16 / 16, inquirer-core 41 / 41 (▲ 0) |
| 3 | `check.test.ts`; `scripts/locale-pack-schema-lock.test.ts` | 30 passed (3 of them new: `coverage`, `locale-pack-in-five` R1); 4 passed |
| 4 (restated) | `evals/cases/locale-pack-from-schema.json` in every `Agent Evals` run | 34 PR readings on 2026-10-20, **34 passed**, median 6, max 8; branch dispatch 39475810887: passed in 6, transcript in D-20261020-locale-pack-in-five-design-gate |

Batch 1's fix landed: the 2026-10-15 run is recorded `not-run`, reason `usage-limit`, and is no
longer a 0 / 11 failure. It is excluded from `caseSeries`.

## Open questions

- Whether a detected agent gets localised prose. **Answered 2026-10-12 in `spec.md`**: no. Under
  agent detection the human surfaces stay in the program's base language unless the program or
  `BURGEE_LOCALE` sets one explicitly, because an agent inherits its user's `LANG` without having
  asked for it.
- Whether `--schema` descriptions are localised. **Answered 2026-10-12 in `spec.md`**: no. They
  sit inside a machine document and stay in the author's base language.
