---
'compat-oracle': patch
'flagstaff': patch
---

Count `optionalDependencies` when weighing a competitor's tree. npm installs them, so a user gets them: cli-table3 0.6.5 declares `@colors/colors` optional, and leaving it out reported 78,148 B across six packages where a `node_modules` holds 105,983 across seven. flagstaff's published comparisons against boxen and cli-table3 are corrected to the measured figures, both of which had overstated the incumbent.
