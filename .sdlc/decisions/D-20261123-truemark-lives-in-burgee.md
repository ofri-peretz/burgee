---
id: D-20261123-truemark-lives-in-burgee
subject: 'Where do the test-integrity checks live, and what are they called?'
taken: 'a burgee package named truemark, published with the next release — the owner, 2026-11-23, in the coordinating session'
date: '2026-11-23'
superseded_by: —
---
**A package in this repository, named `truemark`.** Its CLI is a burgee program, and it is
published with the next release.

This replaces one paragraph of
[`D-20261123-verification-tools-live-in-burgee`](./D-20261123-verification-tools-live-in-burgee.md):
the test-integrity rules were placed in the eslint monorepo as `eslint-plugin-test-integrity`
(eslint#1662). The owner moved them here the same day ("test integrity should live inside burgee",
"it should be based on burgee package"). The rest of that decision stands: a check that can be a
lint rule and belongs to a lint family still goes to the eslint repo; truemark is the exception
because half of it (the changed-lines checks) needs git history and a CLI, and the two halves
share one vocabulary and one docs page.

**One package, two entry points.** `truemark/eslint` is a plain ESLint plugin (no devkit, `eslint`
an optional peer) with four rules: `no-focused-test`, `no-unexplained-skip`, `no-fixed-sleep`,
`no-test-retry`. The `truemark diff` command reads only the changed lines and commit messages of a
range and reports weakened assertions and unexplained snapshot updates; it belongs on `pre-push`.

**The name.** "test-integrity" described the category, not the product. The owner picked
`truemark` (free on npm on 2026-11-23): the mark a test leaves should be a true one.

**Published with the next release.** The usual rule
([`D-20261119-apicontract-stays-private`](./D-20261119-apicontract-stays-private.md)) keeps a
package private until its intent's success criteria are read. The owner approved publishing this
one with the next release on the decision card. The package lands `private` so its code, tests and
pre-push step merge first; the flip to public is its own change, carrying what every published
package here needs (docs page, competitors file, weight row, install and quick-start grades).

Intent: [`truemark`](../intents/truemark/intent.md). The eslint intent it replaces,
`ofri-peretz/eslint` `docs/intents/test-integrity/`, is marked dropped.
