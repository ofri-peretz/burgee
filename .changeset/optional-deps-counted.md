---
'compat-oracle': patch
---

Count `optionalDependencies` when weighing a competitor's resolved tree. npm installs them, so a user gets them — optional means a failed build does not fail the install, not that the package is absent. cli-table3 0.6.5 declares `@colors/colors` optional, and walking `dependencies` alone reported 78,148 B across six packages where a `node_modules` holds 105,983 across seven. One of the nineteen competitors watched is affected.
