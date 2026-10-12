---
"burgee": minor
---

Help, usage errors and hints can speak the user's language. A locale pack is a plugin that carries `locales`: a language tag mapped to catalog ids and their translations. You register it with `program.use(pack)`. It is written against the new `burgee/locale-pack-schema.json`, which lists every message id with its English. The locale comes from the new `locale` run option, then `BURGEE_LOCALE`, then `LC_ALL`, `LC_MESSAGES` and `LANG` (`C` and `POSIX` mean the program's own words). When an agent is detected, `LANG` is ignored. A message with `{count}` takes the plural forms `Intl.PluralRules` selects for the locale. `burgee check <pack>` renders every message, or refuses an unknown id, a placeholder the English lacks, or a missing plural form, with `E_PLUGIN_SCHEMA` and a fix. A pack that cannot be rendered fails the help it would translate as a CONFIG error.

`description`, `summary`, an example's description and an option's description accept `{ en: '…', fr: '…' }`, base language first. Help shows the run's locale, and `--schema`, `--mcp` and completions keep the base language.

`--json`, `--schema`, `--mcp`, `--format=agent`, error kinds and exit codes never change with the locale, and the `error:`, `hint:` and `fix:` labels stay English. With no pack registered and no localised text, every byte of output is unchanged. The commander, yargs and meow front-ends are unchanged.
