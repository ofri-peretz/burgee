# benchmarks

## 0.0.3

### Patch Changes

- Updated dependencies [[`866b972`](https://github.com/ofri-peretz/burgee/commit/866b9724652bebea867a730b8f2ea5e0ca63f5ab), [`8a02d68`](https://github.com/ofri-peretz/burgee/commit/8a02d68fbf30e7837efc7f38899b1f4beb4cee69), [`3a7131f`](https://github.com/ofri-peretz/burgee/commit/3a7131fc279b5964b5d193af68bc0fe81d37821f), [`c992bf2`](https://github.com/ofri-peretz/burgee/commit/c992bf2536ba3ad0c55f45a41167cc9b4be026ec), [`4e5054c`](https://github.com/ofri-peretz/burgee/commit/4e5054cb97ddf6a2838ffc2205ce76d8508feb0b), [`3e56073`](https://github.com/ofri-peretz/burgee/commit/3e560731b386be3429afc7ad0396bcd1c48ad9dd), [`91f46ee`](https://github.com/ofri-peretz/burgee/commit/91f46ee83c839863eecd7d63fd01174087fbb815), [`635eb8c`](https://github.com/ofri-peretz/burgee/commit/635eb8cd2dfc6954c500a67fd8f76c69fcb1031a), [`1955419`](https://github.com/ofri-peretz/burgee/commit/19554194342b55f8893161f894a8c2a4df1b0f21), [`72a8103`](https://github.com/ofri-peretz/burgee/commit/72a810352e9197fdeeb278d283c0f6ae4669d909), [`8a7f387`](https://github.com/ofri-peretz/burgee/commit/8a7f3877936fed75121b325d66b1a78c11f737ac), [`f4be6a8`](https://github.com/ofri-peretz/burgee/commit/f4be6a8733e338bea4483992edeaa72fcddd36fd), [`31efa5b`](https://github.com/ofri-peretz/burgee/commit/31efa5b5e6120eb0d7bcc70778bc38d3dd9a3d7c), [`77ff1cb`](https://github.com/ofri-peretz/burgee/commit/77ff1cb8e595d32bb8bddf441ae21fc61e6f247d), [`91f46ee`](https://github.com/ofri-peretz/burgee/commit/91f46ee83c839863eecd7d63fd01174087fbb815), [`d5a1b02`](https://github.com/ofri-peretz/burgee/commit/d5a1b02792e7109a9ce6c2056683a98f622b2310), [`ef512ea`](https://github.com/ofri-peretz/burgee/commit/ef512ea6052747390b37077e2ea3e1aa3b196e48), [`0d65c75`](https://github.com/ofri-peretz/burgee/commit/0d65c754d3b8cbb46349acb272a62e03caa27236), [`dc1b1a7`](https://github.com/ofri-peretz/burgee/commit/dc1b1a7156f7548d7229b54b9f3d367bfda0af08), [`0592441`](https://github.com/ofri-peretz/burgee/commit/0592441c9ca8f81098a4aff48f15cfb141a0bece)]:
  - paratext@0.7.0
  - caique@0.5.2
  - bellpull@0.4.0
  - burgee@0.12.0
  - flagstaff@0.4.2
  - linegauge@0.5.2
  - roundel@0.5.2

## 0.0.2

### Patch Changes

- Updated dependencies [[`9800b43`](https://github.com/ofri-peretz/burgee/commit/9800b43d9c74a49dfb66d04a40fd0d1c48892e20), [`891e132`](https://github.com/ofri-peretz/burgee/commit/891e132c4b1d8fe3001123014ea977c8ab30e973), [`9800b43`](https://github.com/ofri-peretz/burgee/commit/9800b43d9c74a49dfb66d04a40fd0d1c48892e20), [`b8e97dc`](https://github.com/ofri-peretz/burgee/commit/b8e97dcb64772e413f0b6f9e17e063c73314d242)]:
  - burgee@0.11.0
  - bellpull@0.3.0
  - caique@0.5.0
  - linegauge@0.5.0
  - paratext@0.6.0
  - flagstaff@0.4.0
  - roundel@0.5.0

## 0.0.1

### Patch Changes

- [#420](https://github.com/ofri-peretz/burgee/pull/420) [`0eece2a`](https://github.com/ofri-peretz/burgee/commit/0eece2ac77703d17e830f5eb032c4995cc0e2aeb) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - B4 publishes a second bundle ratio: ours against the incumbent **plus what a user of it installs
  to reach the same capability set**.

  `burgee` is 27,552 bundled bytes and `cac` is 10,457, so the bare row reads 2.636 — a true
  number that stays on the page, and not the choice anybody makes. A program that picks `cac` and
  then wants its config file read, its shutdown bounded on every path out and its cursor handed
  back on Ctrl-C installs three more packages.

  |             | the incumbent alone | + what you add to match burgee |      ours |     ratio |
  | :---------- | ------------------: | -----------------------------: | --------: | --------: |
  | `cac`       |            10,457 B |                       97,711 B |  27,552 B | **0.282** |
  | `commander` |            39,085 B |                      126,354 B |  59,156 B | **0.468** |
  | `yargs`     |           111,110 B |                      198,269 B | 105,240 B | **0.531** |

  The stack is bundled as one program, so a module two additions share is paid for once — which
  is what a real bundler does, and what summing three separate measurements would get wrong.

  **The rule that stops this being a rigged denominator:** a package may enter a stack only where
  this repository publishes a _graded drop-in_ for it — a `compat-oracle` row whose pass rate
  comes from that package's own suite. `parity.test.ts` fails if an addition names a package with
  no active row, which is checked rather than promised. Capabilities with nothing to add against
  (`--schema`, `--mcp`, the `{ ok, data }` envelope, agent detection, option relations) are listed
  and priced at **zero**.

  Reported, never gated: a ceiling here would be a ceiling on somebody else's dependency tree.
  Three new claims settle against it, and the three bare rows keep their own verdicts unchanged.

- [#421](https://github.com/ofri-peretz/burgee/pull/421) [`db3c59e`](https://github.com/ofri-peretz/burgee/commit/db3c59e3dcd373c7e6e4a057715adb173766523f) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A weight for every published subpath, at both ends of the tree-shaking range.

  B4 measures fifteen _pairs_ — an entry point of ours against the package it replaces — which is
  the right shape for a claim and covers fifteen of the **77 code subpaths this repository
  publishes**. A consumer reaching for `flagstaff/progress`, `caique/decide` or `seniority/find-up`
  had no number anywhere, and the per-package weight locks measure the on-disk static graph, which
  is a different quantity from what a bundler puts in an application.

  `/docs/weight` prices all 77, with **every export of every one bundled on its own** — about six
  hundred esbuild runs, forty-five seconds — because "what does this import cost" has no single
  answer:

  |                |                                          |                                            |
  | :------------- | :--------------------------------------- | :----------------------------------------- |
  | **Cheapest**   | the export that costs least, by name     | `burgee/mcp` → `MCP_PROTOCOL_VERSION` 54 B |
  | **Dearest**    | the export that costs most, by name      | `burgee/mcp` → `serveMcp` 4,001 B          |
  | **Everything** | the whole namespace, nothing shaken away | `burgee/mcp` → 4,059 B                     |

  A wide spread means the subpath shakes well and most consumers pay near the left-hand number.
  A narrow one means it arrives as a unit — `burgee/yargs` is 105,222 B for its _cheapest_ export
  — which is worth knowing before importing it rather than after.

  All three are the initial load, from the same function B4 uses, so the two pages cannot disagree
  about what "bundled bytes" means.

  `subpath-weight-lock.test.ts` fails when a published subpath has no row, when anything prices at
  zero (`export *` does not re-export `default`, and that hole read `burgee/meow` — the largest
  façade in the package — as **0 bytes**), and when the page's own generation stamp is more than
  14 days old.

- Updated dependencies [[`db3c59e`](https://github.com/ofri-peretz/burgee/commit/db3c59e3dcd373c7e6e4a057715adb173766523f), [`47b541a`](https://github.com/ofri-peretz/burgee/commit/47b541ade1977e781968bdfb94a41c2bd990b203), [`4b64f6a`](https://github.com/ofri-peretz/burgee/commit/4b64f6ac6b90a5f3d6444a6f6a1731dd3fdd296f), [`4d1b2b3`](https://github.com/ofri-peretz/burgee/commit/4d1b2b399cff354864d1e2e843a19fde80ef1f30), [`f0370b4`](https://github.com/ofri-peretz/burgee/commit/f0370b4e56e3c98a0214ac1fe4fcb1aedbeb8b16), [`db3c59e`](https://github.com/ofri-peretz/burgee/commit/db3c59e3dcd373c7e6e4a057715adb173766523f), [`fb92e13`](https://github.com/ofri-peretz/burgee/commit/fb92e131039b5504b5b7398a99168760e213e1b0), [`47b541a`](https://github.com/ofri-peretz/burgee/commit/47b541ade1977e781968bdfb94a41c2bd990b203), [`47b541a`](https://github.com/ofri-peretz/burgee/commit/47b541ade1977e781968bdfb94a41c2bd990b203), [`db3c59e`](https://github.com/ofri-peretz/burgee/commit/db3c59e3dcd373c7e6e4a057715adb173766523f), [`db3c59e`](https://github.com/ofri-peretz/burgee/commit/db3c59e3dcd373c7e6e4a057715adb173766523f), [`db3c59e`](https://github.com/ofri-peretz/burgee/commit/db3c59e3dcd373c7e6e4a057715adb173766523f), [`c0fa8a3`](https://github.com/ofri-peretz/burgee/commit/c0fa8a37913fab17a6d06615b7432116b1c0e1db), [`c0fa8a3`](https://github.com/ofri-peretz/burgee/commit/c0fa8a37913fab17a6d06615b7432116b1c0e1db)]:
  - burgee@0.9.0
  - bellpull@0.2.0
  - caique@0.4.0
  - flagstaff@0.3.4
  - linegauge@0.4.0
  - paratext@0.5.0
  - roundel@0.4.0
