---
'burgee': patch
---

`burgee/locale-pack-schema.json` no longer prints an `Intl.PluralRules` expression beside the plural forms it lists, which agents ran instead of reading the list, and its top-level description now says each catalog id's English, with its placeholders, is that id's `description` under `$defs.messages`.
