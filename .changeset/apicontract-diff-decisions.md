---
'apicontract': minor
---

`apicontract diff` holds a change to the decision written in the contract. A breaking change needs an `x-change` on the member (or an ancestor, or the operation) naming the decision; an `x-change` that matches no change is stale; a member still present after its `x-sunset` is overdue; a decided breaking change must move the major version (a new `/v4/` path segment, `info.version`, or `--changeset`); and `x-replaced-by` must name a member of the new contract. Misspelled (`x-chnage`), misplaced and invalid markers are reported too. The markers are read, never diffed, so no existing verdict changes.

New flags: `--decisions warn|error|off` and `--today YYYY-MM-DD`. The setting is also read from `diff.decisions` in `apicontract.config.json`, and when the old side is `git:<ref>:<path>` the config at that ref wins over the working tree's, so a change cannot turn off the check it is judged by. `--decisions` wins over both.

`--decisions` defaults to `warn` in this release: findings print and appear in SARIF at `warning`, and the exit code does not change. From the next minor the default is `error`; set `--decisions off` (or `"diff": { "decisions": "off" }`) to opt out.
