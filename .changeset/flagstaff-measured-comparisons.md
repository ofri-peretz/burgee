---
'flagstaff': patch
---

Correct the published weight comparisons against boxen and cli-table3, both of which overstated the incumbent. boxen 8.0.1 is 132,414 B across nineteen packages, not the 151,351 in fourteen the README and weight rules claimed; cli-table3 0.6.5 is 105,983 across seven, not 161,690. ora and log-update reproduce to the byte and are unchanged.
