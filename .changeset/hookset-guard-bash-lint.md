---
"hookset": patch
---

The vendored `guard-bash.mjs` now passes the strict lint of the repos that vendor it: `globToRegExp` is one table-driven replace (cognitive complexity 16 to under 15), a redirect check uses `startsWith`, and a comment no longer reads as commented-out code.
