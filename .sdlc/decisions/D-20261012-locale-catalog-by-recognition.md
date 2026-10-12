---
id: D-20261012-locale-catalog-by-recognition
subject: 'localised-human-surfaces: does English route through `t(id, …)` at every call site, and is a locale pack refused at `register()`?'
taken: Builder, within the accepted design; the owner may reverse it
date: '2026-10-12'
superseded_by: —
---

**Taken: neither, because neither fits the byte ratchets. English stays as it is written at
each call site. A pack translates a finished English line by matching it against the catalog's
templates. A pack is checked where it is first used, and in full by `burgee check`, not inside
`Manifest.use()`.**

The design's sketch was `t('usage.unknownOption', { option })` at each call site, with packs
refused at `register()`. The weight lock measured the headroom on 2026-10-12, before any of
this landed (`packages/burgee/src/weight.test.ts`, built `dist/`):

| entry | measured | budget | headroom |
| :-- | --: | --: | --: |
| `.` | 35,105 | 35,681 | 576 |
| `./help` | 9,025 | 9,130 | 105 |
| `./plugin` | 7,444 | 7,530 | 86 |
| `./yargs` | 220,879 | 220,900 | 21 |

`validate.ts` and `execute.ts` are in the core graph. Between them they write eight usage
messages and seven hints. Each one rewritten as `t(id, template, values)` costs about 30 bytes,
and the lookup function adds about 350. That is more than the 576 bytes `.` had spare.
`help.ts` writes twelve of the catalog's strings against 105 spare bytes. `plugin.ts`,
`manifest.ts` and `definition.ts` all sit in the `./yargs` graph, which had 21 bytes spare, so
pack validation at `use()` could not be added. The brief forbids raising a ratchet.

**What was built instead.**

- `messages.ts` is the catalog: each id with its English template. Only the lazy prose paths
  read it (`failure.ts`, `surfaces.ts` → `locale.ts`) and `burgee check`. A program that never
  localises loads none of it.
- `Localiser.say(english)` recognises an English line as an instance of a catalog template,
  most specific first, takes the template's values, and renders the pack's message. A line the
  catalog does not hold, or the pack does not translate, comes back unchanged.
- English is byte-identical by construction, because nothing about it changed. The two copies
  of each string are held together by `messages.test.ts`, read from the syntax tree in both
  directions. A catalog entry one character off fails it. So does a usage error written
  without an entry.
- `help.ts` takes one `say` option and applies it in four places. `./help` went from 9,025 to
  9,093. Core went from 35,105 to 35,532, most of it R5's define-time normalisation.
  `./plugin` and `./yargs` did not move.
- A pack is checked (`checkLocales`) by the help it would translate, and that help fails as
  CONFIG with `E_PLUGIN_SCHEMA <message>` and the fix as its hint. `burgee check` runs the same
  check. A refusal that a broken pack would translate stays in English, because the error the
  caller needs comes first.

**The cost.** A sentence is recognised, not looked up. An author's own error message that
happens to fit a catalog template exactly would be translated. Help narrows the match to
`help.*` and `exit.*` ids, so an author's description is only matched against help's own words.
In exchange, nothing on the startup path changed shape, and the machine surfaces cannot reach
the catalog: `locale-invariance.test.ts` is the lock that holds this.

**Also decided here.**

- **The labels stay English:** `error:`, `hint:`, `fix:`, `usage:`, `next:`. Scripts and agents
  read them as structure.
- **A `Record` text's base language is its first entry.** No other declaration carries a base
  language, and requiring an `en` key would rule out authors who write in another language.
- **An MCP tool call runs with `locale: 'C'`,** because it answers an agent.
- **`--skill` renders through the same view as help:** `renderSkill(manifest, view)` gets the
  run's localised commands. `burgee skill` writes `SKILL.md` and `AGENTS.md` in the base language,
  because a file on disk has no run locale.
