---
id: D-20261025-cli-foundation-stack-design-accepted
subject: 'cli-foundation-stack: approved as the umbrella over its four shipped children, building Y4 (platform absorption) and Y12 (no-burgee opening), with Y2''s downloads half and S3 dropped?'
taken: 'Accepted — by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-25'
date: '2026-10-25'
superseded_by: —
---

**Accepted as the umbrella over `linegauge`, `seniority`, `bellpull` and `closeout`, and the
intent moves `draft → approved`.** All four have published at 1.x. Each tarball installs alone, and
nine of the twelve floor rows hold through a child. The roadmap tracker asked to "close via
children, move S3/S5 to a new intent". This gate rules on the five pieces left without an owner.

- **Y4, kept. Every layer names the Node builtin it composes, and a probe asks the platform each
  LTS whether it has absorbed the layer.** The builtins are `Intl.Segmenter` and
  `util.stripVTControlCharacters` for `linegauge`, `process.loadEnvFile` and `util.parseEnv` for
  `seniority`, `child_process` for `bellpull`, and `process.on(signal)` for `closeout`. The
  research behind this tier killed two candidates by exactly this test (`candidate-layers.md`), so
  it is the check that tells us when to deprecate one of our own on purpose. The build:
  - a lock that each foundation README names its builtin;
  - an absorption probe that runs each layer's shared test vectors against the builtin alone, on
    every Node line the `compat.yml` floor job runs;
  - the probe reports the count the builtin passes. It is reported, never gated, and a rise opens
    an intent.
- **Y12, kept. A lock that a foundation README's opening never names `burgee`.** It is true by
  reading today, and a check costs one assertion beside `scripts/readme-opening-lock.test.ts`.
  PRINCIPLES 8 says a package leads with its own incumbents and never with a sibling.
- **Y2, restated to its bytes half (held) and its downloads half dropped.** The installed-bytes
  sentence is generated and locked (`readme-benchmarks-lock`, `foundation-ceilings-lock`). A
  combined weekly-downloads figure is a number about other people's packages that changes every
  week. Printed in a README, it is a stale number by the next week, which is what PRINCIPLES 4
  forbids. The incumbents are named in each README's Compatibility table, and the figures live in
  the dated `replacement-map.md`.
- **S3, the 41-copies-to-4 override collapse, dropped.** D-133 withdrew multi-incumbent
  `overrides` because an override can aim only at a package root, and only `linegauge`'s root is
  a drop-in. A collapse measured on a real tree would measure one package. The drop-ins are
  subpaths swapped by import, and `burgee migrate` does that.
- **S5, the lone-layer adopter.** It moved to `first-adopter` A6 on 2026-10-19.

**Build scope, one batch:** the Y4 README lock and absorption probe, and the Y12 lock.
