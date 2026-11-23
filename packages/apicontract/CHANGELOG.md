# apicontract

## 0.1.0

### Minor Changes

- [#1707](https://github.com/ofri-peretz/burgee/pull/1707) [`2144c80`](https://github.com/ofri-peretz/burgee/commit/2144c802249d429165106629013b108d82b80e64) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `apicontract diff` holds a change to the decision written in the contract. A breaking change needs an `x-change` on the member (or an ancestor, or the operation) naming the decision; an `x-change` that matches no change is stale; a member still present after its `x-sunset` is overdue; a decided breaking change must move the major version (a new `/v4/` path segment, `info.version`, or `--changeset`); and `x-replaced-by` must name a member of the new contract. Misspelled (`x-chnage`), misplaced and invalid markers are reported too. The markers are read, never diffed, so no existing verdict changes.

  New flags: `--decisions warn|error|off` and `--today YYYY-MM-DD`. The setting is also read from `diff.decisions` in `apicontract.config.json`, and when the old side is `git:<ref>:<path>` the config at that ref wins over the working tree's, so a change cannot turn off the check it is judged by. `--decisions` wins over both.

  `--decisions` defaults to `warn` in this release: findings print and appear in SARIF at `warning`, and the exit code does not change. From the next minor the default is `error`; set `--decisions off` (or `"diff": { "decisions": "off" }`) to opt out.

## 0.0.2

### Patch Changes

- Updated dependencies [[`7167140`](https://github.com/ofri-peretz/burgee/commit/7167140431f7824106a782cc4be578f8ae5be3d0)]:
  - validator@0.0.1

## 0.0.1

### Patch Changes

- Updated dependencies [[`5054fb7`](https://github.com/ofri-peretz/burgee/commit/5054fb72746ccb28bc08d63d9895a5aa2c50fa77)]:
  - burgee@2.0.0
