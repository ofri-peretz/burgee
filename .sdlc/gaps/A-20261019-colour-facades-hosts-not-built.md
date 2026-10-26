---
id: A-20261019-colour-facades-hosts-not-built
section: A
status: closed
source: colour-facades R1–R5 (D-20261019-colour-facades-design-accepted)
done_when: '`npm run compat -- kleur colorette yoctocolors` reads each row level with its control, each has a B4 pair at ratio ≤ 1 and a `DROP_INS` row, and the intent''s Status table carries evidence for all three criteria'
---

The colour-facades design was accepted on 2026-10-19 in the same pull request that shipped
`roundel/supports-color`. None of its three hosts was built there: each needs compat-oracle work
first, and the spec asks for one host per pull request in the oracle's lane. What each needs,
measured 2026-10-19 on Node 24.12 from the upstream release tags:

- **yoctocolors 2.2.0** (`a02a16ec`): **built 2026-10-20**, 78 / 78 against a control of 78 / 78,
  with no oracle code — `extraDirs` vendors `fixture.js` and `entries` writes the `index.js` it
  imports (D-20261020-colour-facades-yoctocolors-first). What it needed, as measured:
  the smallest step. ava, ESM only, 78 cases. One case spawns
  `node fixture.js` from the repository root, and the vendor step copies only files matching
  `testGlob` when `testDir` is `.`, so the host needs a way to vendor one root file and rewrite its
  import. The drop-in is 61 named exports plus `export * as default`, gated on
  `tty.WriteStream.prototype.hasColors()` at import, and upstream's ava block sets `FORCE_COLOR=1`.
- **kleur 4.1.5** (`fa345448`) — **built 2026-10-25** (`feat/roundel-kleur`,
  D-20261025-colour-facades-kleur-uvu): the `uvu` runner reads uvu's printed summary per file, tsx
  stands where `-r esm` stood (as for signal-exit), and `roundel/kleur` with `roundel/kleur/colors`
  grades 15 / 15 against a control of 15 / 15. `require('roundel/kleur')` hands back kleur's object.
  What it needed, as measured: `uvu -r esm -i utils -i xyz`: two graded files, fifteen cases,
  and the `esm` loader fails on Node 24 before a case runs. kleur ships CommonJS (`index.js`,
  built by `npm run build`), so `require('roundel/kleur')` must hand back kleur's object.
- **colorette 2.0.20** — **built** (`feat/roundel-colorette`, D-20261020-colour-facades-colorette-twist):
  the `twist` runner reads twist's printed counts per file, the host runs in upstream CI's
  environment, and `roundel/colorette` grades 67 / 67 against a control of 67 / 67. The release tag
  `2.0.20` resolves to commit `811fd2f2` (vendored), not the `57c86b6b` this entry named on 2026-10-19.

**Closed 2026-10-25**: all three hosts are built, each level with its control, each with B4 pairs at
a ratio under 1 and `DROP_INS` rows, and the intent's Status table carries the evidence. The
intent itself stays `approved` until roundel's minor carrying them is on npm.

Each host then follows `roundel/supports-color`'s path: a baseline, a `GRADED` row, a capability
column if compat-oracle's `LAYERS` names it for roundel, a B4 pair, a `DROP_INS` row and the docs
generators.
