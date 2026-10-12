---
"caique": minor
"burgee": patch
---

caique's own chrome can speak the user's language. That covers the instruction under a list, a problem with an answer, the giving-up line, and the no-terminal and cancel refusals. A locale pack registered with `register()` carries translations under ids that begin `caique.`, so one object can serve burgee's catalog too. The new `caique/locale` entry turns the runtime's `locale` into the translator: `io.say = sayFor(runtime.locale)`. `ask` and `resolvePrompts` apply it. Neither reads the catalog itself, and caique never reads `LANG`. A refusal keeps its English `message` and `fix`, which a host may put in a machine envelope, and adds `localised` beside them. `caique check` renders a pack's messages, or refuses an unknown id, a stray placeholder or a missing plural form with `E_PLUGIN_SCHEMA`. With no `say` handed in, every byte is unchanged, and `caique/clack` and `caique/inquirer` keep their incumbents' English.

burgee: the family plugin schema it publishes describes the `locales` key.
