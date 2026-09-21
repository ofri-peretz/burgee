---
'linegauge': patch
---

Thirty fewer bundled bytes per entry point, at no change in behaviour.

The five Unicode property classes are built on first use and were cached in one object
keyed by name. A minifier renames a module-level binding to a single character and cannot
touch a property name, so each `classes['zeroWidth']` survived minification at full length.
Five `let` bindings hold the same five regexes: `linegauge` 6,307 → 6,277 bundled bytes,
`linegauge/wrap` 11,278 → 11,248, `linegauge/slice` 8,938 → 8,908.
