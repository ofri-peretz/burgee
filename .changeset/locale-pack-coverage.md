---
"burgee": minor
---

`burgee check` says what a locale pack covers. On a pack it accepts, each locale in the report now carries `coverage`: the catalog ids it translates, the ids it leaves in English, and, for each message that takes a `{count}`, the plural forms written (`have`) against the forms `Intl.PluralRules` selects for that locale (`need`). An author, or an agent writing a pack, reads completeness off the check instead of diffing ids against the schema by hand. `burgee/locale-pack-schema.json`'s description now holds a whole French pack module with a three-form plural, which `burgee check` accepts. Both live on the lazy `check` path: no entry point's weight moves, and `check.js` grows by 613 B.
