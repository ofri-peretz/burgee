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

**Built: 7 of 7** (R1–R5 and R7 in #1044, R6 in #1045).

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** 2026-10-12 | `messages.ts` (the catalog: 82 ids, each with its English), `usage.ts` (`usageText` takes `say`), `fields.ts` (two whole sentences where an `s` was spliced in), `help.ts` (`HelpOptions.say`, applied to headings, row texts and the line for agents), `root-help.ts` (`exitRows` takes `say`). **One departure** ([`D-20261012-locale-catalog-by-recognition`](../../decisions/D-20261012-locale-catalog-by-recognition.md)): English is not routed through `t(id)`. Call sites are unchanged, and a pack translates a finished English line by recognising which catalog template it is an instance of. The `t()` rewrite did not fit the ratchets: `.` had 576 B spare, `./help` 105 B, `./yargs` 21 B | every existing `help-snapshot`, `failure-teaches`, `json-failure` and `unknown-option` case, unchanged (burgee: 1,501 passed); `messages.test.ts`: every template is written where it is used, to the character, and every usage error and hint has an entry. Red: `Failed to resolve import "./messages.js"`; then `"usage.options": "options:"` and five more templates not found as written, and `unknown field{} {}` uncatalogued |
| R2 | **Built** 2026-10-12 | `locale.ts` (`resolveLocale`, `candidatesOf`), `execute.ts` (`RunOptions.locale`, carried on `Io`), `surfaces.ts` and `failure.ts` (resolved on the prose paths only). The run's locale is carried on the run's io, not on `Runtime`: caique reads its own `Runtime.locale` (R6) | `locale.test.ts` (the order; empty skipped; `C`, `POSIX`, `C.UTF-8`; `de_DE.UTF-8` → `de-DE`; `@latin`; agent detection ignoring `LANG`, `LC_ALL`; `candidatesOf` `de-DE` → `de`). Red: `Failed to resolve import "./locale.js"` |
| R3 | **Built** 2026-10-12 | `locale-invariance.test.ts`; `surfaces.ts` (an MCP tool call runs with `locale: 'C'`); `failure.ts` (`sayFor` is the identity under `--json`, and the stderr line is written from the English) | itself: 17 cases, the demo with the test pack (`__fixtures__/locale-pack-de.json`) under `LANG=C` and `LANG=de_DE.UTF-8`. Red on `main`: `expected 'error: unknown option --nope' to be 'error: unbekannte Option --nope'` and help not differing. Red under the mutation that routes the `--json` message through the translator: 4 failed (`--json failure: an unknown option`, `…a missing argument`, `…an unknown command`, `…a value that is not a number`) |
| R4 | **Built** 2026-10-12 | `locale.ts` (`checkLocales`, `localiserOf`, `render`), `plugin.ts` (`Plugin.locales`, a type), `check.ts` (`locales` in the report, each message rendered, each plural form apart), `failure.ts` (a refused pack is a CONFIG failure: `E_PLUGIN_SCHEMA <message>`, the fix as its hint), `locale-pack-schema.json` (published at `burgee/locale-pack-schema.json`; generated by `scripts/locale-pack-schema.ts`). **Refused where first used, not at `register()`**: `plugin.ts`, `manifest.ts` and `definition.ts` are in `./yargs`'s graph with 21 B spare. The pack is checked by the help it would translate, and by `burgee check`. Ids under `caique.` are caique's (R6) and left to caique's check, so one pack object serves both hosts | `check.test.ts` (11 refusals; a pack rendered); `plugin.test.ts` (registers through `use()`; refused for an unknown id, a wrong placeholder, a missing plural form); `scripts/locale-pack-schema-lock.test.ts`. Red: 13 failed in `check.test.ts` (`expected { name: 'pack', commands: [], hooks: [] } to deeply equal { …, locales: [ … ] }`; refusals reported as `E_NO_CONTRIBUTION`); 3 failed in `plugin.test.ts` (`expected +0 to be 3`) |
| R5 | **Built** 2026-10-12 | `execute.ts` (`Localised`, `DeclaredOption`, `DeclaredExample`; `based`: a `Record` text becomes its first entry, the base language, and the declaration rides along under `Symbol.for('burgee.l10n')`), `locale.ts` (`inLocale`, `commandInLocale`), `surfaces.ts` (help's view). Every machine projection reads only the base string. `skill.ts` (`renderSkill` takes the same view: `--skill` renders the run's locale; `burgee skill` writes its files in the base language) | `help.test.ts` › `a localised description renders in the resolved locale (R5)` (5 cases, `--skill` among them); `schema.test.ts` › `--schema carries the base language of a localised description (R5)`. Red: `Type '{ en: string; de: string; }' is not assignable to type 'string'` (TS2322); `expected '{"schemaVersion":1,…' not to match /Werkzeug\|bereitstellen\|ändern\|"los"/u` |
| R6 | **Built** 2026-10-12 | `caique/src/messages.ts` (16 ids, all under `caique.`), `locale.ts` (published at `caique/locale`: `sayFor(runtime.locale)`, `checkLocales`), `ask.ts` (`Io.say` on the list instruction, the problem and the giving-up line; never the author's question), `binding.ts` (a refusal keeps English `message`/`fix` and gains `localised`, because a host may write it into a machine envelope), `decide.ts`/`runtime.ts` (`Runtime.locale`), `check.ts` (renders a pack's caique messages). **The translator is handed in, not loaded**: caique's weight walker counts `import()` too, and `./binding` had 1,105 B spare against the catalog's 15,817. A pack is checked where it is first used (`sayFor`) and by `caique check` | `caique/src/locale.test.ts` (22 cases), `messages.test.ts`; `npm run compat -- clack inquirer-core` unchanged. Red: `Cannot find module './locale.js'` |
| R7 | **Built** 2026-10-12 | `evals/cases/locale-pack-from-schema.json` (French, whose `Intl.PluralRules` select `one`, `many`, `other`), on the weekly `evals.yml` schedule beside the ten plugin cases | `scripts/run-evals.ts`; the case's shell checks were run both ways. Green against a correct pack, and red against the same pack without `many`: `locales.fr["usage.stdinOnce"] is missing the plural form many`, with fix `give every form Intl.PluralRules selects for fr: one, many, other` |

**Weight, measured on the built `dist/` (`weight.test.ts`).** `.` 35,105 → 35,532 B (budget 35,681).
`./help` 9,025 → 9,093 B (9,130). `./plugin`, `./yargs`, `./schema` and `./mcp` did not move. The
bundled core is 24,273 B on top of `main`'s 23,918 B (merged 2026-10-12, after `agent-skill` R2–R6 and `mcp-current`
R2), inside the 24,282 B `bundled-bytes` ceiling, which was not raised.
No budget was raised.
