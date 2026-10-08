---
id: D-20261008-install-bytes
subject: 'U12 found our layers make an install heavier, with fewer packages but more bytes; do we cut the shipped schema, the .d.ts comments or the READMEs to close that'
taken: Taken
date: '2026-10-08'
superseded_by: —
---

**No. All three stay, and the adoption pitch says "fewer packages", never "lighter".**

**The measurement.** On 2026-10-08 (npm tarballs), the five packages a chalk + ora swap
installs (roundel, flagstaff, closeout, paratext and linegauge) weigh about 686 KB:

| part | size |
| :-- | --: |
| JavaScript | ≈ 254 KB |
| `.d.ts` | ≈ 192 KB |
| READMEs | ≈ 107 KB |
| the family `schema.json` (17,225 B in each package) | 86 KB |

On apify/mcpc that was +338 KB (+1.2%) for 13 fewer packages (U12 trial, see the burgee spec's
U12 row).

**Why each part stays.**
- **`schema.json` in every package.** `./schema.json` is a published export of every 1.x
  package (D-170, D-20261006-foundation-1-0-evidence, D-20261007-caique-controlroom-1-0-evidence,
  D-20261008-seniority-1-0-evidence). Plan step 1.1 requires one plugin schema across the family,
  so each package's file is the same document. Shipping it once would remove an export from
  eight 1.x packages, which needs a major for each. That is a cost to every user, paid to win a
  byte comparison.
- **`.d.ts` doc comments.** `scripts/strip-comments.mjs` strips JavaScript and keeps
  declarations' comments, so the hover text a user reads in an editor arrives with the types.
  Removing them saves about half the `.d.ts` bytes and costs every TypeScript user their docs.
- **READMEs.** npm renders the README from the tarball, so it is the package's page.

**What this commits us to.**
- **The pitch.** Any adoption pitch or README claim states the trade as measured: fewer packages
  and maintainers in the install tree, at roughly equal or slightly larger bytes. It never says
  "lighter install" or "smaller". The bundled-bytes claims (what a program's bundle carries) are
  separate and stand.
- **Reopening.** Reopen this only if a measured adopter declines because of install bytes. Then
  weigh a `schema.json` that re-exports one shared copy at the next majors.
