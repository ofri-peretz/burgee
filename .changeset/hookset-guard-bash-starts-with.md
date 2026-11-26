---
'hookset': patch
---

The vendored `guard-bash.mjs` checks for a merge commit with `startsWith("Merge ")` instead of
`/^Merge /.test(…)`. Consumers copy the pack byte for byte, so oxlint's
`unicorn/prefer-string-starts-ends-with` failed their lint on a line they could not edit (agents
had to keep the vendored hooks out of oxlint). A test now fails on any anchored-literal regex in
the pack.
