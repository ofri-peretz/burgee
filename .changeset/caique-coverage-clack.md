---
"caique": patch
---

Two fixes in `caique/clack`, and paths no input could reach are removed. A prompt aborted while its validator was still running drew one more frame after it had closed and given the cursor back, so the frame landed under whatever the program wrote next; it now writes nothing once closed. `date` took a locale's field separator from its first literal, which in Pashto is the space after the era, so the fields read `yyyy mm dd` rather than `yyyy-mm-dd`; it now takes the literal after the first field, which is also right where the last literal is a suffix, as in Bulgarian's `г.`. `caique/raw`'s `askList`, called directly with no choices, answered a multiselect with `['']` after a space; it now answers `[]`. The fallbacks removed from `clack-core`, `clack-date`, `clack-prompts`, `clack-search`, `raw`, `binding` and `terminal` are for values that are always there; behaviour is otherwise unchanged.
