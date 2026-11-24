# apicontract

## 0.4.2

### Patch Changes

- [#1768](https://github.com/ofri-peretz/burgee/pull/1768) [`4120b28`](https://github.com/ofri-peretz/burgee/commit/4120b286a73ea8f60210d20639d3727e81c49983) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `bin` paths are written the way `npm pkg fix` writes them (`dist/bin.js`, not `./dist/bin.js`), so `npm publish` no longer warns that it auto-corrected the manifest. `burgee init` scaffolds `"bin": { "<name>": "cli.mjs" }` for the same reason. Every family package's manifest follows, and a lock keeps the leading `./` out.

- [#1770](https://github.com/ofri-peretz/burgee/pull/1770) [`1a431f5`](https://github.com/ofri-peretz/burgee/commit/1a431f56860941998adf0de19683e74bf312f1b1) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `props` reads a payload on its own when one of its `$ref`s points inside it (such as
  `#/properties/b`), as it did before definitions were shared; only references to the contract's
  definitions go through the shared reader.
- Updated dependencies [[`4120b28`](https://github.com/ofri-peretz/burgee/commit/4120b286a73ea8f60210d20639d3727e81c49983)]:
  - burgee@2.2.1

## 0.4.1

### Patch Changes

- [#1767](https://github.com/ofri-peretz/burgee/pull/1767) [`dc457f8`](https://github.com/ofri-peretz/burgee/commit/dc457f890987c9db31dcd952f60c4e0d762ce97b) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `props` reads a contract's definitions once for every payload, not once for each, and no longer
  copies the run's reported keywords on every draw: on the Stripe description, the start-up before the
  first value fell from 36 s to 1.5 s, with the same report.
- Updated dependencies [[`dc457f8`](https://github.com/ofri-peretz/burgee/commit/dc457f890987c9db31dcd952f60c4e0d762ce97b)]:
  - loadline@0.2.0

## 0.4.0

### Minor Changes

- [#1765](https://github.com/ofri-peretz/burgee/pull/1765) [`d718668`](https://github.com/ofri-peretz/burgee/commit/d71866827d9ebb5b7f9e6fd811fabdde0ae657f6) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `diff` reads an HTTP operation's security requirement: asking for credentials it did not, or
  other ones, is `ac-security-narrowed` (breaking for a caller), and asking for less is
  `ac-security-widened`. A renamed path parameter is now reported as `ac-path-parameter-renamed`,
  dangerous: the URL is the same, but a client generated from the old contract passes it by name.

## 0.3.0

### Minor Changes

- [#1751](https://github.com/ofri-peretz/burgee/pull/1751) [`d218e73`](https://github.com/ofri-peretz/burgee/commit/d218e734a61c1c3f95f245f1fb784360db3861de) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - First publish. apicontract is now contractdiff (the package, the `contractdiff` command, the
  `contractdiff/testing` import, and the `contractdiff.config.json` and `contractdiff.map.json`
  files), and the validator is now loadline (`import { check } from 'loadline'`). Both are public,
  with a README, a mark and their place in the family.

### Patch Changes

- Updated dependencies [[`d218e73`](https://github.com/ofri-peretz/burgee/commit/d218e734a61c1c3f95f245f1fb784360db3861de)]:
  - loadline@0.1.0

## 0.2.0

### Minor Changes

- [#1732](https://github.com/ofri-peretz/burgee/pull/1732) [`094be08`](https://github.com/ofri-peretz/burgee/commit/094be08f2acf0c8b2d603fbe55105e246eb2eaab) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `apicontract props <contract>`: property tests drawn from the contract, with no server. Values are made from each payload's JSON Schema by a generator written apart from the validator, and four properties are checked: the validator accepts every value made and refuses each with one constraint broken, at the place broken; values survive JSON and back; `normalise` is idempotent and accepts what the schema accepts; and, with `--against <old>`, every payload the classifier calls compatible passes the receiver for any value the sender may send. Runs replay from the printed `--seed`, counterexamples are shrunk, keywords the generator does not hold to are reported, and `--emit <file>` writes fast-check arbitraries for a consumer's own tests.

### Patch Changes

- Updated dependencies [[`2c0b40e`](https://github.com/ofri-peretz/burgee/commit/2c0b40eb01d0243609a6d23a5740161be5f20fbf), [`2c0b40e`](https://github.com/ofri-peretz/burgee/commit/2c0b40eb01d0243609a6d23a5740161be5f20fbf), [`6a69ea5`](https://github.com/ofri-peretz/burgee/commit/6a69ea56bd6900cb4610b56e703c90092fed4aaf)]:
  - bellpull@2.0.3
  - burgee@2.2.0

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
