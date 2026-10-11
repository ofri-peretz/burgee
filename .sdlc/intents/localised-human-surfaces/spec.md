# Design — Localised for people, invariant for programs

Intent: [`intent.md`](./intent.md). **Status:** approved.

**Accepted by the owner, 2026-10-12, by instruction: create and execute.** The instruction and the
evidence are recorded in [`next-wave-2026-10.md`](../../research/next-wave-2026-10.md). This
design supersedes the `locale` deferral in `cli-help-renderer/spec.md` R1 ("waits for a first
localised adopter"). The evidence that replaces the adopter is commander #1801.

> Requirement ids are `R1`… so they cannot collide with the floor ids `scripts/run-evals.ts`
> reads from `burgee/spec.md`.

---

## Requirements

- **R1 — One catalog of the engine's human strings.** Every string the engine writes for a
  person moves into `messages.ts`, keyed by a stable id (`usage.unknownOption`,
  `help.globalOptions`, `hint.runHelp`…), with placeholders (`{option}`). The strings are
  usage errors, hints, help headings, the "For agents" line and the exit-code descriptions.
  English is the default. Every existing snapshot is unchanged: R1 is a pure refactor, proven
  by the snapshots themselves.
- **R2 — The locale is resolved once, natively.**
  - **Order**: the program's `locale` option, then `BURGEE_LOCALE`, then `LC_ALL`,
    `LC_MESSAGES`, `LANG`.
  - **Normalised through `Intl.Locale`**: `de_DE.UTF-8` → `de-DE` → `de` → the base language.
    `C` and `POSIX` mean the base language.
  - **Under agent detection** (`agent.ts`), the environment variables are ignored and only the
    program's option or `BURGEE_LOCALE` applies.
  - The Runtime carries the resolved locale, so `caique` reads it without importing burgee.
- **R3 — Machine surfaces are invariant, and a lock says so.**
  `packages/burgee/src/locale-invariance.test.ts` runs the demo under the test pack and
  `LANG=de_DE.UTF-8`, and asserts these are byte-identical to `LANG=C`:
  - `--json` success and failure (stdout and the stderr error line);
  - `--schema`;
  - `--mcp` `initialize` and `tools/list`;
  - `--format=agent`;
  - the exit code of every failure kind.

  It also asserts that human help and the human error line differ, so the test cannot pass by
  localising nothing.
- **R4 — A locale is a plugin.**
  - **Shape**: `{ name, locales: { 'de': { '<id>': '<message>' } } }`, registered through the
    plugin contract's one `register()`, and validated by a JSON Schema published with burgee.
  - **The schema refuses**: an id the catalog does not have, a placeholder the English message
    does not have, a plural message missing a form `Intl.PluralRules` selects for that locale.
  - **`burgee check <pack>`** renders every message of every locale in the pack.
- **R5 — Authors localise their own text.** `description`, `summary`, an example's description
  and an option's description accept `string | Record<string, string>`, keyed by locale with the
  author's base language required. Help and `--skill` render the resolved locale. `--schema` and
  `--mcp` always carry the base language (R3).
- **R6 — caique's own chrome reads the catalog.** The prompt chrome caique draws natively uses
  catalog ids: the non-TTY refusal, validation messages and the cancel line. `caique/clack` and
  `caique/inquirer` keep their incumbents' English, because those suites grade it.
- **R7 — An agent can write a pack.** An eval case,
  `evals/cases/locale-pack-from-schema.json`, gives an agent the pack schema and one example pack
  and asks for a new language. It passes when `burgee check` accepts the output. It runs on the
  same weekly schedule as the plugin-from-schema eval (`PRINCIPLES.md` rule 7's bar).

## Design

**Order:** R1 (the refactor, snapshots unchanged), R2, R3 (the lock lands before anything can
localise), R4, R5, R6, R7.

**A catalog that costs nothing in English.** The English strings stay inlined at their call
sites behind one lookup function: `t('usage.unknownOption', { option })` returns the English
template when no pack is loaded, without touching any table. A pack is a `Map` filled at
`register()`. So a program that never localises pays one function call per message and no bytes
of translation.

**Why the machine surfaces cannot drift.** None of them reads `t()`. The envelope carries `kind`,
`code` and a `message`, and under `--json` the message is always rendered in the base language
whatever the locale. That is R3's first assertion. The lock is the guard against a future edit
that routes a machine string through `t()`.

**Plural forms are data the pack declares.** A message with a count is
`{ one: '…', other: '…' }`, with whatever forms the locale's `Intl.PluralRules` names, and the
schema check in R4 knows them. No message-format parser is written.

## Verification

| R | Check | Proven red by |
| :-- | :-- | :-- |
| R1 | every existing `help-snapshot`, `failure-teaches`, `json-failure` and `unknown-option` case, unchanged | a catalog entry differing by one character from today's string fails a snapshot |
| R2 | `packages/burgee/src/locale.test.ts` (new): the resolution order; `C` and `POSIX`; `de_DE.UTF-8` → `de-DE` → `de`; agent detection ignoring `LANG` | today: no resolution exists |
| R3 | `packages/burgee/src/locale-invariance.test.ts` (new) | a mutation routing the `--json` error message through `t()` fails it |
| R4 | `packages/burgee/src/plugin.test.ts` and `check.test.ts`: a pack with an unknown id, a wrong placeholder or a missing plural form is refused with the plugin error vocabulary (`scripts/plugin-error-vocabulary-lock.test.ts`) | today: no pack key exists in the plugin schema |
| R5 | `help.test.ts`: a `Record` description renders in the resolved locale; `schema.test.ts`: `--schema` carries the base language under `LANG=de_DE.UTF-8` | today: a `Record` description is a type error |
| R6 | `packages/caique/src/*.test.ts` for the native chrome; `npm run compat -- clack inquirer-core` unchanged | a façade string routed through the catalog fails its graded suite |
| R7 | the eval runner (`scripts/run-evals.ts`) | the case fails when `burgee check` refuses the output |

## Rejected alternatives

- **Ship translations.** The family would own the quality of languages its maintainers do not
  read. Packs are data that agents and users write, which is rule 7, and the family proves the
  mechanism with a test pack.
- **Localise `--json` messages too.** A script that compares a message breaks when the user's
  `LANG` changes. The machine contract is `kind` and `code`, and the message stays in the base
  language there.
- **ICU MessageFormat.** A parser for a grammar the catalog needs one corner of. Plural forms as
  declared data cover counts, and placeholders cover the rest.
- **Wait for an adopter, as `cli-help-renderer` did.** Rule 7 counts declined requests as demand.
  A 31-comment decline is more evidence than one adopter.

## Out of scope

- Right-to-left layout. `linegauge` defers bidi reordering, and help is laid out by it.
- Localising `burgee/commander` and `burgee/yargs` output, which is graded against the
  incumbents.
- Date and number formatting in a program's own results. Those are the author's data.

## Status

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | Not built | `messages.ts`, `failure.ts`, `usage.ts`, `help.ts`, `validate.ts`, `suggest.ts` | the existing snapshots |
| R2 | Not built | `runtime.ts`, `agent.ts` | `locale.test.ts` |
| R3 | Not built | `locale-invariance.test.ts` | itself |
| R4 | Not built | `plugin.ts`, the plugin schema, `check.ts` | `plugin.test.ts`, `check.test.ts` |
| R5 | Not built | `execute.ts` (`Command`), `help.ts`, the skill renderer | `help.test.ts`, `schema.test.ts` |
| R6 | Not built | `caique/src/ask.ts`, `decide.ts` | caique tests, `npm run compat -- clack inquirer-core` |
| R7 | Not built | `evals/cases/locale-pack-from-schema.json` | `scripts/run-evals.ts` |
