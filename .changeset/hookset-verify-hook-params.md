---
'hookset': patch
---

`verify-before-stop`'s `recordPass` takes the test run as one `{ command, failed }` argument, so the vendored hook passes a consumer's `max-params` lint at four parameters (serverless's eslint flagged five).
