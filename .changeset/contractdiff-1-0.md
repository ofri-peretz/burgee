---
"contractdiff": major
---

contractdiff is 1.0. Its entries `.`, `./core`, `./openapi`, `./openapi-typescript` and `./testing`, the `contractdiff` bin and its commands, the `contractdiff.config.json` and `contractdiff.map.json` formats, the `ac-*` finding codes `diff` reports and its exit codes are now a semver contract: a change `diff` calls breaking today stays breaking on every 1.x. Nothing changed in the code; the evidence is D-20261124-verification-family-1-0, which also states what the `./openapi-typescript` entry does not do, measured on openapi-typescript's own suite.
