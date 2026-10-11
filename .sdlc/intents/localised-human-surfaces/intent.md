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

1. `npx vitest run --config vitest.root.config.ts packages/burgee/src/locale-invariance.test.ts`
   runs the demo's surfaces (`--json` success and failure, `--schema`, `--mcp` `tools/list`,
   `--format=agent`, exit codes) under `LANG=de_DE.UTF-8` with the test pack registered. It
   asserts each is byte-identical to `LANG=C`, and asserts that human help and errors differ.
2. Every existing help and failure snapshot passes unchanged.
3. `burgee check <pack>` validates a locale pack against its JSON Schema: unknown ids,
   placeholders that do not match, missing plural forms. It renders every message.
4. An eval case: an agent given the pack schema and one example writes a passing pack for a new
   language in one turn. It runs weekly beside the plugin eval.

## Open questions

- Whether a detected agent gets localised prose. **Answered 2026-10-12 in `spec.md`**: no. Under
  agent detection the human surfaces stay in the program's base language unless the program or
  `BURGEE_LOCALE` sets one explicitly, because an agent inherits its user's `LANG` without having
  asked for it.
- Whether `--schema` descriptions are localised. **Answered 2026-10-12 in `spec.md`**: no. They
  sit inside a machine document and stay in the author's base language.
