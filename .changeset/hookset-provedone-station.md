---
"hookset": minor
---

A new enforced `commit-msg` station, `hookset-provedone`, runs `npm run hook:provedone -- {1}`: a commit with no `Verified-by:` receipt fails. `hookset check` reports a repo that does not declare `hook:provedone`. Declare it as `"hook:provedone": "provedone gate --mode enforce"` with `provedone` as a devDependency.
