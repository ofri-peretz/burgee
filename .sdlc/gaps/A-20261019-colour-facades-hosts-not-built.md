---
id: A-20261019-colour-facades-hosts-not-built
section: A
status: open
source: colour-facades R1–R5 (D-20261019-colour-facades-design-accepted)
done_when: '`npm run compat -- kleur colorette yoctocolors` reads each row level with its control, each has a B4 pair at ratio ≤ 1 and a `DROP_INS` row, and the intent''s Status table carries evidence for all three criteria'
---

The colour-facades design was accepted on 2026-10-19 in the same pull request that shipped
`roundel/supports-color`. None of its three hosts was built there: each needs compat-oracle work
first, and the spec asks for one host per pull request in the oracle's lane. What each needs,
measured 2026-10-19 on Node 24.12 from the upstream release tags:

- **yoctocolors 2.2.0** (`a02a16ec`), the smallest step. ava, ESM only, 78 cases. One case spawns
  `node fixture.js` from the repository root, and the vendor step copies only files matching
  `testGlob` when `testDir` is `.`, so the host needs a way to vendor one root file and rewrite its
  import. The drop-in is 61 named exports plus `export * as default`, gated on
  `tty.WriteStream.prototype.hasColors()` at import, and upstream's ava block sets `FORCE_COLOR=1`.
- **kleur 4.1.5** (`fa345448`). `uvu -r esm -i utils -i xyz`: two graded files, fifteen cases,
  and the `esm` loader fails on Node 24 before a case runs. The oracle needs a `uvu` runner and a
  loader substitution (`tsx`, as for signal-exit). kleur ships CommonJS (`index.js`, built by
  `npm run build`), so `require('roundel/kleur')` must hand back kleur's object.
- **colorette 2.0.20** (`57c86b6b`). `twist tests/*.js`: three files, and twist exits 0 with
  failures, so neither the exit-code runner nor a TAP reader grades it. The oracle needs a twist
  runner that reads its `Tests: N failed, M passed` line. Off a terminal, 58 of 67 cases fail
  against colorette itself, so the host needs upstream CI's environment. colorette ships
  CommonJS (`index.cjs`).

Each host then follows `roundel/supports-color`'s path: a baseline, a `GRADED` row, a capability
column if compat-oracle's `LAYERS` names it for roundel, a B4 pair, a `DROP_INS` row and the docs
generators.
