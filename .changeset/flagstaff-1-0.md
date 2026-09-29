---
"flagstaff": major
---

flagstaff 1.0.0. No API changes from 0.4: this release makes a promise. Every published entry point is now under semver and can change incompatibly only in a new major: `flagstaff` and `flagstaff/loop`, `plugin`, `import`, `spinner`, `progress`, `tasks`, `box` and `table`, the four drop-in subpaths, the `schema.json` plugin contract and the `flagstaff` bin. Each drop-in path is graded at 100% by its incumbent's own test suite, vendored at the release tag and run unmodified: ora 9.4.1 by 99 of 99 cases (`flagstaff/ora`), log-update 8.0.0 by 99 of 99 (`flagstaff/log-update`), boxen 8.0.1 by 84 of 84 (`flagstaff/boxen`) and cli-table3 0.6.5 by 29 of 29 (`flagstaff/cli-table3`). Out of scope: `flagstaff/boxen` is a boxen 8 drop-in. boxen 9 is released but is not graded or claimed, and a program on it is left alone by `burgee migrate`. Earlier majors of the four incumbents are not claimed either.
