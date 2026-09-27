---
"burgee": patch
"caique": patch
"closeout": patch
"flagstaff": patch
"roundel": patch
"seniority": patch
---

Lint with every published Interlace ESLint plugin, and fix what the upgrade surfaced.

- caique: the inquirer theme merge skips `__proto__`, `constructor` and `prototype` keys, so a theme object cannot swap the merged object's prototype.
- burgee: last-element reads use `.at(-1)`.
- burgee, closeout, flagstaff, roundel: helpers that capture nothing from their enclosing function move to module scope.
- seniority: suppression comments name the `no-dynamic-require` rule that now reports the config loader's dynamic `require`.

No public API or output changes.
