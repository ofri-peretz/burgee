---
id: D-20261118-apicontract-diff-rule-prefix
subject: 'apicontract `diff`: are our own rule ids prefixed `ac-` or `cp-`?'
taken: Taken
date: '2026-11-18'
superseded_by: —
---

**`ac-`.** A `diff` finding with no oasdiff id is reported as `ac-<rule>`, e.g. `ac-maxLength-set` or
`ac-operation-removed`. This replaces the prefix half of
[`D-20261106-apicontract-diff-rule-ids`](./D-20261106-apicontract-diff-rule-ids.md), which said `cp-`
when the product's working name was different. Everything else that record decided still stands:
oasdiff's id wherever a change is one oasdiff names, and `--json` carries the scheme beside each id.

The prefix names the tool, and the tool is `apicontract`. The diff spec
([`apicontract-diff/spec.md`](../intents/apicontract-diff/spec.md) R6) and the code
(`packages/apicontract/src/diff-rules.ts`) already said `ac-` when the lane built it; this record makes
the decision say the same. Reversible until the first release: the prefix is one template in `ruleId`,
pinned by `diff-rules.test.ts`. After release it is a suppression-list break, and is not changed again
without one.

The owner delegated decisions like this on 2026-11-18
([`D-20261118-contracts-program-go-ahead`](./D-20261118-contracts-program-go-ahead.md)).
