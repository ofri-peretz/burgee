---
id: D-20261119-validator-name-loadline
subject: 'What is the validator package called when it publishes?'
taken: 'loadline — the owner, 2026-11-19, in the coordinating session'
date: '2026-11-19'
superseded_by: —
---
**`loadline`.** The name proposed in [`validator/intent.md`](../intents/validator/intent.md) is accepted.
It was free on npm when read on 2026-11-19 (`curl https://registry.npmjs.org/loadline` → 404).

The name does not change when the package publishes. The intent's rule still holds: no publish
and no public claim before the capabilities are implemented and the metrics read. The package
stays `private` and keeps its working name in the repository until then. The rename happens in
the PR that first publishes it.
