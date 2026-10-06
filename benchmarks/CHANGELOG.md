# benchmarks

## 0.0.13

### Patch Changes

- Updated dependencies [[`1945d65`](https://github.com/ofri-peretz/burgee/commit/1945d65f22aafabd380d67f1e40341d6ef3aa6fa), [`1945d65`](https://github.com/ofri-peretz/burgee/commit/1945d65f22aafabd380d67f1e40341d6ef3aa6fa), [`9ebef65`](https://github.com/ofri-peretz/burgee/commit/9ebef654930ac4565f1ee04ec5f8b6f735c6a1d9), [`1945d65`](https://github.com/ofri-peretz/burgee/commit/1945d65f22aafabd380d67f1e40341d6ef3aa6fa), [`8118d5c`](https://github.com/ofri-peretz/burgee/commit/8118d5c8754a09a61c8b050169d9515121908591)]:
  - bellpull@1.0.0
  - paratext@1.0.0
  - roundel@1.0.0
  - burgee@0.20.0
  - caique@0.7.2
  - controlroom@0.2.1
  - flagstaff@1.2.1

## 0.0.12

### Patch Changes

- [#815](https://github.com/ofri-peretz/burgee/pull/815) [`28cb9a5`](https://github.com/ofri-peretz/burgee/commit/28cb9a5e13f3e638a77ecc78bba514113d2b8b3a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - controlroom's README documents the line that runs packages written for ink on `controlroom/ink` unchanged — `"ink": "file:./ink"`, a two-file package that re-exports the drop-in — and why a bare `npm:` alias cannot: it names a package, not a subpath. `ink-spinner`, `ink-text-input` and `ink-select-input` run that way, as published, in `examples/ink-ecosystem`, and `examples/chat-cli-ink` is the chat boilerplate written for Ink and run on the drop-in.

  The benchmarks measure controlroom's weight gates against ink 6.8.0 on React 19.3.0, each at ≤ 1.0×: the drop-in with React and the reconciler bundled against ink with React (W1, 0.745), the same two installed, in bytes and in packages (W2, 0.378 and 0.238), the native root against ink alone (W3, 0.048), and importing each entry point against importing ink and React (W4, 0.289 and 0.144). A B4 side may now be several imports, with externals, and counted whole when its peers load under top-level await.

- Updated dependencies [[`a47209b`](https://github.com/ofri-peretz/burgee/commit/a47209b3a7774e4ecdd1def3043d19afed5a1266), [`28cb9a5`](https://github.com/ofri-peretz/burgee/commit/28cb9a5e13f3e638a77ecc78bba514113d2b8b3a), [`5230016`](https://github.com/ofri-peretz/burgee/commit/52300169a98ece41b3544e5316833464e63a7c83), [`5230016`](https://github.com/ofri-peretz/burgee/commit/52300169a98ece41b3544e5316833464e63a7c83), [`5230016`](https://github.com/ofri-peretz/burgee/commit/52300169a98ece41b3544e5316833464e63a7c83), [`5230016`](https://github.com/ofri-peretz/burgee/commit/52300169a98ece41b3544e5316833464e63a7c83), [`5230016`](https://github.com/ofri-peretz/burgee/commit/52300169a98ece41b3544e5316833464e63a7c83)]:
  - caique@0.7.1
  - controlroom@0.2.0
  - paratext@0.9.0
  - compat-oracle@0.1.7
  - bellpull@0.5.2
  - burgee@0.18.0
  - flagstaff@1.1.1
  - linegauge@1.0.4
  - roundel@0.6.3

## 0.0.11

### Patch Changes

- [#779](https://github.com/ofri-peretz/burgee/pull/779) [`ec04103`](https://github.com/ofri-peretz/burgee/commit/ec04103616b66bc1bab43f400a94c23f40358b9c) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `burgee/yargs` follows yargs 18.2.0 and passes all 816 of its tests (real yargs: 814). With `SHELL` naming fish, `--get-yargs-completions` answers `value<TAB>description` and offers choices verbatim, and `completion` prints the fish script (`> ~/.config/fish/completions/<app>.fish`). The zsh script's `zsh_eval_context` test no longer carries a stray quote, so an autoloaded function is called rather than re-registered — the fix 18.2.0 made. The façade's bundle is 3 bytes smaller than before, fish included.

  compat-oracle's yargs suite is re-vendored at `v18.2.0` (816 tests, twelve added), and `burgee migrate` names 18.2.0 as the yargs release `burgee/yargs` was graded at.

- Updated dependencies [[`ec04103`](https://github.com/ofri-peretz/burgee/commit/ec04103616b66bc1bab43f400a94c23f40358b9c)]:
  - burgee@0.17.1
  - compat-oracle@0.1.5

## 0.0.10

### Patch Changes

- [#780](https://github.com/ofri-peretz/burgee/pull/780) [`c901047`](https://github.com/ofri-peretz/burgee/commit/c90104751a84e46b8bfd4d007a90c40d3f88658c) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - B5 ceilings are derived from each pair's CI spread, max(mean + 3σ, largest reading), and the derivation is written beside each ceiling. Spec bars keep their value and run more rounds.
- Updated dependencies [[`1857ff6`](https://github.com/ofri-peretz/burgee/commit/1857ff65ca0e1b0b5686480c1a37dc8834bf688b), [`1857ff6`](https://github.com/ofri-peretz/burgee/commit/1857ff65ca0e1b0b5686480c1a37dc8834bf688b), [`08976ae`](https://github.com/ofri-peretz/burgee/commit/08976ae734f0494720e0dce06dd850bf7177766f)]:
  - bellpull@0.5.1
  - linegauge@1.0.2
  - burgee@0.16.0
  - roundel@0.6.2

## 0.0.9

### Patch Changes

- Updated dependencies [[`d901bcb`](https://github.com/ofri-peretz/burgee/commit/d901bcb082af3ce748aba39dd18944b3efa769ea), [`b44f426`](https://github.com/ofri-peretz/burgee/commit/b44f426621ed799700cceda8c979de8f759f56b7), [`b69d513`](https://github.com/ofri-peretz/burgee/commit/b69d5136ac6a49e6bf39178f73fbd89f3f4c2653), [`6195b99`](https://github.com/ofri-peretz/burgee/commit/6195b99344a21b4a05ab100fc38358deab229ce8), [`24300f4`](https://github.com/ofri-peretz/burgee/commit/24300f42455836e73ba36daaf400c4ab2f8d1893)]:
  - burgee@0.15.0
  - paratext@0.8.0
  - compat-oracle@0.1.4
  - roundel@0.6.1
  - caique@0.6.4
  - flagstaff@1.0.3

## 0.0.8

### Patch Changes

- Updated dependencies [[`e928581`](https://github.com/ofri-peretz/burgee/commit/e928581996fdeb317b4c849ae285593bfecf6b4d), [`1817b62`](https://github.com/ofri-peretz/burgee/commit/1817b6286fae3943e79686a42dc635cca0f0cdda), [`6c2e9c5`](https://github.com/ofri-peretz/burgee/commit/6c2e9c5cee5d9962c0d75d84a766c76b76760f7f), [`ee2b2ce`](https://github.com/ofri-peretz/burgee/commit/ee2b2ce452a3c5469ebadcb637dcc23015e81d3f), [`6c2e9c5`](https://github.com/ofri-peretz/burgee/commit/6c2e9c5cee5d9962c0d75d84a766c76b76760f7f)]:
  - bellpull@0.5.0
  - burgee@0.14.3
  - caique@0.6.3
  - compat-oracle@0.1.3
  - linegauge@1.0.1
  - paratext@0.7.5
  - flagstaff@1.0.2

## 0.0.7

### Patch Changes

- [#760](https://github.com/ofri-peretz/burgee/pull/760) [`a115799`](https://github.com/ofri-peretz/burgee/commit/a1157991a5defddadfbea49ba8ea3bf161d4a832) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - chalk's graded release is 6.0.1: compat-oracle's vendored suite is re-vendored at `v6.0.1` (59 tests, one added), and `burgee migrate` names 6.0.1 as the chalk release `roundel/chalk` was graded at.

  B2 cold start also spawns `picocolors`, `roundel/tokens` and `roundel/chalk`, and gates roundel's R8 time bar — each colour entry within picocolors + 10 ms — as `cold-start-delta-ms`, the median of per-round differences.

- Updated dependencies [[`a115799`](https://github.com/ofri-peretz/burgee/commit/a1157991a5defddadfbea49ba8ea3bf161d4a832), [`a115799`](https://github.com/ofri-peretz/burgee/commit/a1157991a5defddadfbea49ba8ea3bf161d4a832)]:
  - burgee@0.14.2
  - compat-oracle@0.1.2
  - roundel@0.6.0
  - caique@0.6.2
  - flagstaff@1.0.1

## 0.0.6

### Patch Changes

- [#756](https://github.com/ofri-peretz/burgee/pull/756) [`5881db0`](https://github.com/ofri-peretz/burgee/commit/5881db06176716a7f9bc42011a4bb2a2c9e0dd7a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - B5 gains `bellpull ÷ tinyexec`, bellpull R8's spawn half: `run('node', ['--version'])` against tinyexec's `x`, each awaited to the child's close with its stdout read. Gated at 1.0 — R8's own bar, not a ratchet above a measurement. Reads 0.933 on an M4 Pro.
- Updated dependencies [[`12bac9c`](https://github.com/ofri-peretz/burgee/commit/12bac9c99cb87ec2b67a56b4afc38de2c21687c7), [`22e6dae`](https://github.com/ofri-peretz/burgee/commit/22e6dae1b71bfa478265829a1b98d20a6f9de4f7)]:
  - paratext@0.7.4
  - bellpull@0.4.5
  - caique@0.6.1
  - roundel@0.5.6

## 0.0.5

### Patch Changes

- [#744](https://github.com/ofri-peretz/burgee/pull/744) [`e60303c`](https://github.com/ofri-peretz/burgee/commit/e60303ce839e4342b86963d6cbd6faa97d7ee921) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - B5, runtime against the incumbent: `npm run bench -- --axis runtime` times each entry point doing one realistic job against the package it replaces, in-process and interleaved, and gates every pair with a downward-only ratchet in `.sdlc/bands/runtime-ratchets.json` toward ≤ 1.0.

## 0.0.4

### Patch Changes

- Updated dependencies [[`3250edf`](https://github.com/ofri-peretz/burgee/commit/3250edf439a45ccfd203213eddec0d9fb091e8cd), [`3e837cb`](https://github.com/ofri-peretz/burgee/commit/3e837cbd557735dd8823a54bd9f5cd03c8852221), [`1f9ad70`](https://github.com/ofri-peretz/burgee/commit/1f9ad70189396c701b17034a98fcd8f59fb700de), [`063025e`](https://github.com/ofri-peretz/burgee/commit/063025e5f9ca5ae30d4987989b23ee3248ce523e), [`8b6b1e0`](https://github.com/ofri-peretz/burgee/commit/8b6b1e04109c8dfb1bf7d623750dd3d415c996d3), [`b52659f`](https://github.com/ofri-peretz/burgee/commit/b52659fbb7da12fa5fe372962af3bcdac0d022e6), [`e4c1f69`](https://github.com/ofri-peretz/burgee/commit/e4c1f6951dcbc73d581ce1edce4cf3f9ae183058), [`2c631cb`](https://github.com/ofri-peretz/burgee/commit/2c631cb820ec181dd7615864cc6ce7412ee7cafe), [`b9de3f3`](https://github.com/ofri-peretz/burgee/commit/b9de3f341bb59b9a2139bb094809176af5a65bee), [`9a65722`](https://github.com/ofri-peretz/burgee/commit/9a657220fe9c877ca475e7be1f3a575a0e88a76a), [`7f59bc2`](https://github.com/ofri-peretz/burgee/commit/7f59bc2a612aa71925d5eca1db96d44d9f488c9a), [`9a72329`](https://github.com/ofri-peretz/burgee/commit/9a723299803d10d784bf20fa63425e741f750368), [`6ef8227`](https://github.com/ofri-peretz/burgee/commit/6ef822762f5ad19564215945d7e76aa329614585), [`d26728b`](https://github.com/ofri-peretz/burgee/commit/d26728b26b44cbcc5edafca6bf1a91acbd1e1d35), [`6ef8227`](https://github.com/ofri-peretz/burgee/commit/6ef822762f5ad19564215945d7e76aa329614585), [`fa0ff53`](https://github.com/ofri-peretz/burgee/commit/fa0ff53bb461e8c58a9085d8697ebc12d8709ab1), [`6ef8227`](https://github.com/ofri-peretz/burgee/commit/6ef822762f5ad19564215945d7e76aa329614585), [`7c77cd2`](https://github.com/ofri-peretz/burgee/commit/7c77cd25c8fbeea4199c38c135e3a8937907f849), [`8bc14e6`](https://github.com/ofri-peretz/burgee/commit/8bc14e644f02a28ce54333d683742f2fca027917), [`6ef8227`](https://github.com/ofri-peretz/burgee/commit/6ef822762f5ad19564215945d7e76aa329614585), [`6ef8227`](https://github.com/ofri-peretz/burgee/commit/6ef822762f5ad19564215945d7e76aa329614585), [`12fea8e`](https://github.com/ofri-peretz/burgee/commit/12fea8eae4d556b11dc693581cca73e16c2b633c), [`5b3dafa`](https://github.com/ofri-peretz/burgee/commit/5b3dafa8c94096d59a286d13ebc06ac30d75bfa5), [`e9f45d8`](https://github.com/ofri-peretz/burgee/commit/e9f45d85d9db5b2e3dcaa1e43f292a1281a6952a), [`8a338ba`](https://github.com/ofri-peretz/burgee/commit/8a338baa50bb754051b18c00dbd0972976cccba1), [`6c7b55a`](https://github.com/ofri-peretz/burgee/commit/6c7b55a01ea2e3aa1993419f78fbf6858ade5f8b), [`620fc74`](https://github.com/ofri-peretz/burgee/commit/620fc74af013834ca6b15faa2772aeb94c5013b1), [`088cecc`](https://github.com/ofri-peretz/burgee/commit/088ceccb7dda1cbe878950c631f49f48980dd2e2), [`5052d67`](https://github.com/ofri-peretz/burgee/commit/5052d67489c4c58f610cf161f5cc50a0c8ef2263), [`4319563`](https://github.com/ofri-peretz/burgee/commit/4319563b902c9d968786196f495cf47e7d4d9d39), [`b74a24d`](https://github.com/ofri-peretz/burgee/commit/b74a24de9fa747b25aa1b405cff8958f7c42d0db), [`deffcc6`](https://github.com/ofri-peretz/burgee/commit/deffcc679cf3e97e0d2f538bc09c6810e478b80e)]:
  - bellpull@0.4.3
  - burgee@0.14.1
  - caique@0.6.0
  - compat-oracle@0.1.1
  - flagstaff@1.0.0
  - linegauge@1.0.0
  - paratext@0.7.3
  - roundel@0.5.5

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
