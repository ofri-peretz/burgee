---
"roundel": minor
---

New entry points `roundel/kleur` and `roundel/kleur/colors`: kleur 4's two modules, graded 15 / 15 by kleur 4.1.5's own suite, level with kleur itself, and bundled at 1,049 B against kleur's 1,839 and 930 B against kleur/colors' 997. `roundel/kleur` is kleur's one object — `enabled` and twenty-six chainable styles, `kleur.red().bold('x')` — and `require('roundel/kleur')` returns it, as `require('kleur')` does; `roundel/kleur/colors` is kleur's plain functions and `$`. Colour is kleur's own rule, decided once at import and kept on the switch a caller assigns — a truthy `NODE_DISABLE_COLORS`, a `NO_COLOR` that is set at all, `TERM=dumb`, then `FORCE_COLOR` other than `0` or a terminal on stdout — not `roundel/policy`'s. `roundel/policy` does not change.
