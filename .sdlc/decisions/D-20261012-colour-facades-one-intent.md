---
id: D-20261012-colour-facades-one-intent
subject: 'Are `kleur`, `colorette` and `yoctocolors` three intents or one, and where do they sit in the compat-oracle lane?'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs'
date: '2026-10-12'
superseded_by: —
---

**One intent, three hosts graded in turn (kleur, then colorette, then yoctocolors), each a
`roundel/<name>` subpath over `roundel/tokens`, entered in the compat-oracle lane after wave 3's
last graded host (`previous-majors` yargs 17).** Wave 3 scored each at 4 · 5 ÷ 3 = 6.7 and
rejected them only for the lane. Together they are 158,336,748 /wk (`replacement-map.md`,
2026-09-09: 70,902,431 + 52,887,824 + 34,546,493), which is demand 5 on the scale.

**Why one intent.** The three APIs are the same job (a function per style, a colour check) and
share one implementation, `roundel/tokens`, whose ceiling is already picocolors' bytes. Three
intents would write the same design three times.

**Ceiling.** Each subpath bundles at or under its incumbent (U5), measured by B4's method.

**Reversal.** Drop a host from the intent; the others stand alone.
