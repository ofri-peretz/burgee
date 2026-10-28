---
"caique": patch
---

`caique/inquirer` follows `@inquirer/core` 12.0.6 and `caique/inquirer/prompts` follows `@inquirer/prompts` 8.7.5. The first render waits a tick only when the input is a terminal, so an answer already piped into a non-TTY stdin before the prompt starts is read instead of dropped. `password` keeps the space after its message while the mask has nothing to draw, so the cursor sits past it. Their own suites grade them 46 / 46 and 222 / 222, level with the incumbents.
