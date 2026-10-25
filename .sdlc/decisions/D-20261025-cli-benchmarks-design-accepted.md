---
id: D-20261025-cli-benchmarks-design-accepted
subject: 'cli-benchmarks: is the re-grounded design, with S4 settled as "state the median and range of the CI series" and B7 as a link lock, accepted for Build?'
taken: 'Accepted — by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-25'
date: '2026-10-25'
superseded_by: —
---

**Accepted. [`cli-benchmarks/spec.md`](../intents/cli-benchmarks/spec.md) § Design gate 2026-10-25
is the design Build implements, and the intent moves `review → approved`.**

**What re-grounding found.** The suite is built: seven axes, one `npm run bench`, `bench.yml`,
and a generated `/docs/benchmarks`. Seven of the nine criteria hold. The sample floors (R6, B1
N≥5) have been locked since 2026-10-19 by `benchmarks/sample-floor.test.ts`. Two items are open.

**S4, the owner call the intent was waiting on, taken here under the delegation.** The claim
is **confirmed, and it is stated as a series, never as one run.** Over the 50 CI readings dated
2026-10-10 to 2026-10-18, the token ratio has median 0.504 (range 0.434–0.627, at or under 0.6 in
49 of 50). The turn ratio has median 0.524 (range 0.446–0.634, at or under 0.7 in all 50). The
public row still states 0.699× from one run, `e6cff20`, and B1 has been seen to swing by more
than that between two runs of the same commit, so no single reading is a verdict. The README
and `comparison.mdx` row therefore state the median and the range over a named window of CI
readings, generated from `benchmarks/results/agent-cli-bench/`. `claim-table-lock` is restated
to check the row against that window. The committed published measurement
(`2026-10-09.json`) is superseded by the window and kept as history.

**B7, kept.** Every public number in the README, `comparison.mdx` and the package READMEs
links to `/docs/benchmarks`. A lock finds each benchmark number those files state and fails on
one with no link. It is proven red by removing one link.

**Alternatives rejected.** *Leave S4 as an owner call*: the owner delegated measurement and
publication calls on 2026-10-12, and holding it put a stale 0.699× on the README for two weeks.
*Publish the newest reading*: one B1 run is not a verdict (PRINCIPLES 4; the B1 fairness
finding). *Drop B7*: "every public number links to its measurement" is the half of PRINCIPLES 4
that stops a number from going stale in prose.

**Build scope, one batch:** the S4 series row and its restated lock, and the B7 link lock.
