---
'burgee': patch
---

Every package README now carries a generated `## Where it sits`: which key plugins register
under, and what is above and below the package in the family (PLAN 5.2).

Both facts are derived rather than written down a second time. The keys come off each
package's own `export interface Plugin` — its members besides `name` and `contract` *are* the
keys — and the edges come from the manifests' own dependency lists. The first version matched
a fixed alternation of key names instead and reported flagstaff as hosting none, when it hosts
four the alternation had never heard of: the whole argument against a second copy, made by the
function that was the second copy.

`scripts/readme-lock.test.ts` holds it. The assertion that matters is 5.2's own
done-condition — a hand edit fails — and it is proven rather than asserted: the test edits a
README and requires the check to notice. Tampering `caique`'s real file with a `gadgets` key
turns it red, which is the check that makes the other five mean something.
