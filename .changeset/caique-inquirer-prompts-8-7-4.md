---
"caique": patch
---

`caique/inquirer` follows `@inquirer/core` 12.0.5 and `caique/inquirer/prompts` follows `@inquirer/prompts` 8.7.4. A prompt cancelled or aborted before its first render never draws it and leaves no listener on the input. `checkbox` shows its loading state while an async `validate` runs and ignores every key until it answers. `number` reads a line of only whitespace as empty: the default, or a refusal under `required`. Their own suites grade them 45 / 45 and 221 / 221, level with the incumbents.
