---
"burgee": patch
---

`burgee check` refuses a locale pack with every problem at once: `refused.problems` lists each one with its own `fix`, and `refused.message` and `refused.fix` list them all, numbered. Before, it stopped at the first, so a pack with three mistakes took three runs. A missing plural form's fix now gives each form the locale selects with a count for it, e.g. `one (for 0), many (for 1000000), other (for 2) for fr`. `burgee/locale-pack-schema.json` names the plural forms of the common languages in the plural message's description and gives a French example, since French needs `many` and the German example does not show it.
