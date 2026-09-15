---
'compat-oracle': patch
---

A case the incumbent's own suite marks `test.failing()` — it cannot do the thing and says
so — which the target then passes is counted as a pass, not a failure.

ava reports a passing `test.failing` as `not ok`: from the incumbent's side an unexpected
pass means a stale annotation to clean up. Read as a verdict on the target it is exactly
backwards, and it held `slice-ansi` at 14 / 15 for a day on the strength of the one case
`linegauge` does **better** — it round-trips an `OSC 8` hyperlink, which `slice-ansi`
cannot.

The denominator does not move: this is not an exclusion, which would shrink the suite and
improve the rate without saying why. The case stays in, counted as the pass it is, keyed
strictly on ava's own diagnostic so nothing else can trip it, and surfaced as `exceeded` on
the report line — `(1 the host marks failing and we pass)` — because a reclassification
nobody sees is a grader marking its own homework. A control run cannot reach it: there the
incumbent really does fail the case and ava prints a plain `ok`.
