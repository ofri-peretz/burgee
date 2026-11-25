# truepass

## 1.0.1

### Patch Changes

- [#1814](https://github.com/ofri-peretz/burgee/pull/1814) [`06089bd`](https://github.com/ofri-peretz/burgee/commit/06089bd8a1cdee49927e49a508e36ae7fa57ae78) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - truepass's docs have a site of their own at https://truepass.interlace.tools: getting started, guides, a page for coming from @vitest/eslint-plugin, recipes and the API reference. The package's `homepage` and README point there.

- [#1813](https://github.com/ofri-peretz/burgee/pull/1813) [`4821145`](https://github.com/ofri-peretz/burgee/commit/482114557947f01bc8df543daf317dada2664c21) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `no-fixed-sleep` no longer reports a zero or omitted delay (`setTimeout(r, 0)`, `setTimeout(r)`, `sleep(0)`, `waitForTimeout(0)`): it is a tick flush, as inside React's `act()`, not a fixed sleep. `truepass diff` runs its three git calls one after another, so a bad `--base` always quotes the first git command that failed, and `--help` names the default base once.
- Updated dependencies [[`4821145`](https://github.com/ofri-peretz/burgee/commit/482114557947f01bc8df543daf317dada2664c21)]:
  - burgee@2.2.2

## 1.0.0

### Major Changes

- [#1798](https://github.com/ofri-peretz/burgee/pull/1798) [`78d014b`](https://github.com/ofri-peretz/burgee/commit/78d014badecbaa3cbf1bfa6aa94be01745359659) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - truepass is 1.0. Its entries `.` and `./eslint`, its four rules (`no-focused-test`, `no-unexplained-skip`, `no-fixed-sleep`, `no-test-retry`), the `truepass diff` command, its `--json` finding shape and its exit codes are now a semver contract: a rule is renamed or removed, or reports something new by default, only in a 2.0. Nothing changed in the code; the evidence is D-20261124-verification-family-1-0: 100% coverage, every spec row built, and a first full mutation run with no surviving mutant.

## 0.1.3

### Patch Changes

- [#1773](https://github.com/ofri-peretz/burgee/pull/1773) [`80d0383`](https://github.com/ofri-peretz/burgee/commit/80d03839c6d18db2d845dcc9ff51b279a48e207b) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `loadline` is now `truefit` and `truemark` is now `truepass`. npm refused both old names on first publish as too similar to `readline` and `remark`. The code is the same; only the package name, the bin and the docs changed.

## 0.1.2

### Patch Changes

- [#1768](https://github.com/ofri-peretz/burgee/pull/1768) [`4120b28`](https://github.com/ofri-peretz/burgee/commit/4120b286a73ea8f60210d20639d3727e81c49983) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `bin` paths are written the way `npm pkg fix` writes them (`dist/bin.js`, not `./dist/bin.js`), so `npm publish` no longer warns that it auto-corrected the manifest. `burgee init` scaffolds `"bin": { "<name>": "cli.mjs" }` for the same reason. Every family package's manifest follows, and a lock keeps the leading `./` out.
- Updated dependencies [[`4120b28`](https://github.com/ofri-peretz/burgee/commit/4120b286a73ea8f60210d20639d3727e81c49983)]:
  - burgee@2.2.1

## 0.1.1

### Patch Changes

- [#1721](https://github.com/ofri-peretz/burgee/pull/1721) [`d0a6443`](https://github.com/ofri-peretz/burgee/commit/d0a6443a999ad28196f5bac7b0ec843f00dd112e) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - truemark is public: its README, its page on burgee.interlace.tools, and `@vitest/eslint-plugin` as the incumbent it is measured against.
- Updated dependencies [[`2c0b40e`](https://github.com/ofri-peretz/burgee/commit/2c0b40eb01d0243609a6d23a5740161be5f20fbf), [`2c0b40e`](https://github.com/ofri-peretz/burgee/commit/2c0b40eb01d0243609a6d23a5740161be5f20fbf), [`6a69ea5`](https://github.com/ofri-peretz/burgee/commit/6a69ea56bd6900cb4610b56e703c90092fed4aaf)]:
  - bellpull@2.0.3
  - burgee@2.2.0

## 0.1.0

### Minor Changes

- [#1715](https://github.com/ofri-peretz/burgee/pull/1715) [`233d865`](https://github.com/ofri-peretz/burgee/commit/233d8653f27c4bb5716345541cc607d45c4afc63) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - truemark, the test-integrity checks: `truemark/eslint` reports focused tests, skips without a reason, fixed sleeps and retries; `truemark diff` reads only the changed lines and commit messages of `<base>...HEAD` and reports an assertion moved to a weaker matcher and a snapshot updated with no `Snapshot:` line saying why.

### Patch Changes

- Updated dependencies [[`14c0153`](https://github.com/ofri-peretz/burgee/commit/14c01531d78b79fa150d830cd281d88ab94e1977)]:
  - burgee@2.1.5
