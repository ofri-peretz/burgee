# compat-oracle

## 0.1.5

### Patch Changes

- [#779](https://github.com/ofri-peretz/burgee/pull/779) [`ec04103`](https://github.com/ofri-peretz/burgee/commit/ec04103616b66bc1bab43f400a94c23f40358b9c) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `burgee/yargs` follows yargs 18.2.0 and passes all 816 of its tests (real yargs: 814). With `SHELL` naming fish, `--get-yargs-completions` answers `value<TAB>description` and offers choices verbatim, and `completion` prints the fish script (`> ~/.config/fish/completions/<app>.fish`). The zsh script's `zsh_eval_context` test no longer carries a stray quote, so an autoloaded function is called rather than re-registered — the fix 18.2.0 made. The façade's bundle is 3 bytes smaller than before, fish included.

  compat-oracle's yargs suite is re-vendored at `v18.2.0` (816 tests, twelve added), and `burgee migrate` names 18.2.0 as the yargs release `burgee/yargs` was graded at.

- Updated dependencies [[`ec04103`](https://github.com/ofri-peretz/burgee/commit/ec04103616b66bc1bab43f400a94c23f40358b9c)]:
  - burgee@0.17.1

## 0.1.4

### Patch Changes

- [#774](https://github.com/ofri-peretz/burgee/pull/774) [`b44f426`](https://github.com/ofri-peretz/burgee/commit/b44f426621ed799700cceda8c979de8f759f56b7) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `paratext/term-img` now takes a file path, as `term-img` does. `terminalImage('unicorn.jpg')` reads the file with `node:fs` and draws it, and a file `URL` works too. The read happens after the terminal check, so a path handed to a terminal that cannot draw it reaches your `fallback` (or `UnsupportedTerminalError`) without the file being opened. A missing file on a supported terminal throws `node:fs`'s `ENOENT`, as `term-img` does. The `Options` type is exported under term-img's name and is generic over what `fallback` returns, so a `fallback` that returns nothing type-checks.

  `paratext/term-img` now grades 18 / 18 against term-img 7.1.0's own suite, level with term-img itself. It was 12 / 18: the six cases that pass a path were refused under D-030. This supersedes D-030 for this subpath only (D-20260930-paratext-term-img-path). It is the only paratext entry that imports `node:fs`. The root `image()` still takes bytes, and a lock fails if `node:fs` reaches the root or any other entry.

  Because the row is level, `burgee migrate` now rewrites `term-img` to `paratext/term-img`.

- Updated dependencies [[`d901bcb`](https://github.com/ofri-peretz/burgee/commit/d901bcb082af3ce748aba39dd18944b3efa769ea), [`b44f426`](https://github.com/ofri-peretz/burgee/commit/b44f426621ed799700cceda8c979de8f759f56b7), [`b69d513`](https://github.com/ofri-peretz/burgee/commit/b69d5136ac6a49e6bf39178f73fbd89f3f4c2653), [`6195b99`](https://github.com/ofri-peretz/burgee/commit/6195b99344a21b4a05ab100fc38358deab229ce8), [`24300f4`](https://github.com/ofri-peretz/burgee/commit/24300f42455836e73ba36daaf400c4ab2f8d1893)]:
  - burgee@0.15.0
  - roundel@0.6.1
  - flagstaff@1.0.3

## 0.1.3

### Patch Changes

- [#764](https://github.com/ofri-peretz/burgee/pull/764) [`1817b62`](https://github.com/ofri-peretz/burgee/commit/1817b6286fae3943e79686a42dc635cca0f0cdda) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `caique/clack` now grades 16 / 16 against `@clack/prompts` 1.8.1's own suite, level with clack itself at 16 / 16. It was 16 / 17. The pass count did not change. The denominator did: one case, `guide.test.ts`'s `no prompt renders a guide when withGuide is globally false`, is now excluded by its exact title. It imports `updateSettings` from `@clack/core` and asserts that the prompts read that package's module state, so it grades `@clack/core` and not `@clack/prompts` (D-20260930-caique-clack-core-exclusion). The exclusion and its reason are on the compatibility page.

  Because the row is level, `burgee migrate` now rewrites `@clack/prompts` to `caique/clack`. It refuses a file that imports `box`, `progress` or `taskLog`, which `caique/clack` does not build, and leaves that file on clack. It does not rewrite `@clack/core`. So a migrated program that imports `updateSettings` from `@clack/core` is still changing clack's settings, and caique's prompts never read them. Import `updateSettings` from `caique/clack` instead.

- Updated dependencies [[`1817b62`](https://github.com/ofri-peretz/burgee/commit/1817b6286fae3943e79686a42dc635cca0f0cdda), [`ee2b2ce`](https://github.com/ofri-peretz/burgee/commit/ee2b2ce452a3c5469ebadcb637dcc23015e81d3f), [`6c2e9c5`](https://github.com/ofri-peretz/burgee/commit/6c2e9c5cee5d9962c0d75d84a766c76b76760f7f)]:
  - burgee@0.14.3
  - flagstaff@1.0.2

## 0.1.2

### Patch Changes

- [#760](https://github.com/ofri-peretz/burgee/pull/760) [`a115799`](https://github.com/ofri-peretz/burgee/commit/a1157991a5defddadfbea49ba8ea3bf161d4a832) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - chalk's graded release is 6.0.1: compat-oracle's vendored suite is re-vendored at `v6.0.1` (59 tests, one added), and `burgee migrate` names 6.0.1 as the chalk release `roundel/chalk` was graded at.

  B2 cold start also spawns `picocolors`, `roundel/tokens` and `roundel/chalk`, and gates roundel's R8 time bar — each colour entry within picocolors + 10 ms — as `cold-start-delta-ms`, the median of per-round differences.

- Updated dependencies [[`a115799`](https://github.com/ofri-peretz/burgee/commit/a1157991a5defddadfbea49ba8ea3bf161d4a832), [`a115799`](https://github.com/ofri-peretz/burgee/commit/a1157991a5defddadfbea49ba8ea3bf161d4a832)]:
  - burgee@0.14.2
  - roundel@0.6.0
  - flagstaff@1.0.1

## 0.1.1

### Patch Changes

- [#638](https://github.com/ofri-peretz/burgee/pull/638) [`e4c1f69`](https://github.com/ofri-peretz/burgee/commit/e4c1f6951dcbc73d581ce1edce4cf3f9ae183058) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `caique/clack` now carries `@clack/prompts`' prompts, not only `limitOptions`: `text`, `password`, `confirm`, `multiline`, `date`, `path`, `select`, `selectKey`, `multiselect`, `groupMultiselect`, `autocomplete` and `autocompleteMultiselect`, with `intro`, `outro`, `cancel`, `note`, `log`, `stream`, `spinner`, `tasks`, `group`, the `S_*` glyphs, `settings`/`updateSettings` and `isCancel`, under clack's names and options. They run on caique's own keypress loop and reach nothing outside this repository. Graded by clack's own suite at 16 / 17 (was 14 / 17; the control is 17 / 17): the one case left imports `updateSettings` from `@clack/core`, which caique does not depend on (D-152). The spinner animates only on a terminal outside CI and prints each message once anywhere else. `box`, `progress` and `taskLog` are not built. `burgee migrate` reports the new grade and, since it is not level with the control, still does not rewrite `@clack/prompts`.

- [#650](https://github.com/ofri-peretz/burgee/pull/650) [`9a72329`](https://github.com/ofri-peretz/burgee/commit/9a723299803d10d784bf20fa63425e741f750368) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Grade execa 10.0.1's own suite against `bellpull` as a ceiling: 0 / 1048, control 1048 / 1048
  (GAPS A10, D-160). A host may now declare `ceiling` — graded to publish a distance, never a
  drop-in `burgee migrate` rewrites to or reports — and an import may declare `namedOnly`, so a
  bare specifier is rewritten only where a module is named and not where the same word is a value.

- [#686](https://github.com/ofri-peretz/burgee/pull/686) [`fa0ff53`](https://github.com/ofri-peretz/burgee/commit/fa0ff53bb461e8c58a9085d8697ebc12d8709ab1) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `LAYERS` names thirteen more incumbents — the packages chalk, ora, terminal-link, inquirer, yargs, meow and string-width are built on (supports-color, ansi-styles, is-unicode-supported, is-interactive, cli-spinners, get-east-asian-width, supports-hyperlinks, `@inquirer/ansi`, find-up, escalade, read-package-up, cli-cursor, stdin-discarder) — so `layer-boundaries-lock` refuses a family package that depends on one.
- Updated dependencies [[`3e837cb`](https://github.com/ofri-peretz/burgee/commit/3e837cbd557735dd8823a54bd9f5cd03c8852221), [`1f9ad70`](https://github.com/ofri-peretz/burgee/commit/1f9ad70189396c701b17034a98fcd8f59fb700de), [`063025e`](https://github.com/ofri-peretz/burgee/commit/063025e5f9ca5ae30d4987989b23ee3248ce523e), [`8b6b1e0`](https://github.com/ofri-peretz/burgee/commit/8b6b1e04109c8dfb1bf7d623750dd3d415c996d3), [`e4c1f69`](https://github.com/ofri-peretz/burgee/commit/e4c1f6951dcbc73d581ce1edce4cf3f9ae183058), [`7f59bc2`](https://github.com/ofri-peretz/burgee/commit/7f59bc2a612aa71925d5eca1db96d44d9f488c9a), [`6ef8227`](https://github.com/ofri-peretz/burgee/commit/6ef822762f5ad19564215945d7e76aa329614585), [`d26728b`](https://github.com/ofri-peretz/burgee/commit/d26728b26b44cbcc5edafca6bf1a91acbd1e1d35), [`6ef8227`](https://github.com/ofri-peretz/burgee/commit/6ef822762f5ad19564215945d7e76aa329614585), [`8bc14e6`](https://github.com/ofri-peretz/burgee/commit/8bc14e644f02a28ce54333d683742f2fca027917), [`12fea8e`](https://github.com/ofri-peretz/burgee/commit/12fea8eae4d556b11dc693581cca73e16c2b633c), [`5b3dafa`](https://github.com/ofri-peretz/burgee/commit/5b3dafa8c94096d59a286d13ebc06ac30d75bfa5), [`e9f45d8`](https://github.com/ofri-peretz/burgee/commit/e9f45d85d9db5b2e3dcaa1e43f292a1281a6952a), [`6c7b55a`](https://github.com/ofri-peretz/burgee/commit/6c7b55a01ea2e3aa1993419f78fbf6858ade5f8b), [`620fc74`](https://github.com/ofri-peretz/burgee/commit/620fc74af013834ca6b15faa2772aeb94c5013b1), [`088cecc`](https://github.com/ofri-peretz/burgee/commit/088ceccb7dda1cbe878950c631f49f48980dd2e2), [`5052d67`](https://github.com/ofri-peretz/burgee/commit/5052d67489c4c58f610cf161f5cc50a0c8ef2263), [`4319563`](https://github.com/ofri-peretz/burgee/commit/4319563b902c9d968786196f495cf47e7d4d9d39), [`b74a24d`](https://github.com/ofri-peretz/burgee/commit/b74a24de9fa747b25aa1b405cff8958f7c42d0db), [`deffcc6`](https://github.com/ofri-peretz/burgee/commit/deffcc679cf3e97e0d2f538bc09c6810e478b80e)]:
  - burgee@0.14.1
  - flagstaff@1.0.0
  - roundel@0.5.5

## 0.1.0

### Minor Changes

- [#101](https://github.com/ofri-peretz/burgee/pull/101) [`0054016`](https://github.com/ofri-peretz/burgee/commit/00540168f7cdbdd50c7d903ce9a4c28585a989f8) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The upstream watch covers every declared competitor, not only the hosts with a vendored
  suite, and its issue says what our change should be.

  A package declares its competitors per subpath in `competitors.json`, holding the claim
  (`compat`, `weight` or `surface`) and the last-seen fingerprint — so an upstream release
  arrives as a git diff on a committed file. Competitors without a vendored suite are
  fingerprinted from the published tarball rather than a clone: downloaded, checked against
  the registry's own `dist.shasum`, and unpacked in memory by a tar reader written for the
  purpose, so no `npm install` runs and no upstream lifecycle script executes in a job that
  holds a token.

  Every number is tied to the bytes it came from. The tarball's `package.json` must name the
  package and version we asked for, and a disagreement throws rather than reporting a
  plausible figure — which is what a watch resolving the declared name `clack` would have
  done, since npm's `clack` is an unrelated placeholder at 0.1.0 and the prompts library is
  `@clack/prompts`.

  The daily issue gains a second half: which of our subpaths claims parity or a weight
  ceiling against that package, which published numbers are now stale and the file and line
  they are written on, and the `.changeset/*.md` body we should ship — with the bump derived
  from the kind of change. An added export on a graded façade is `minor`; a removed export,
  or a dropped entry point, proposes no bump at all, because following a removal is a
  decision rather than a follow.

### Patch Changes

- [#149](https://github.com/ofri-peretz/burgee/pull/149) [`0d2520b`](https://github.com/ofri-peretz/burgee/commit/0d2520b04d297880f7117e54757361d0e04018c4) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Count `optionalDependencies` when weighing a competitor's resolved tree. npm installs them, so a user gets them — optional means a failed build does not fail the install, not that the package is absent. cli-table3 0.6.5 declares `@colors/colors` optional, and walking `dependencies` alone reported 78,148 B across six packages where a `node_modules` holds 105,983 across seven. One of the nineteen competitors watched is affected.

- [#316](https://github.com/ofri-peretz/burgee/pull/316) [`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A case the incumbent's own suite marks `test.failing()` — it cannot do the thing and says
  so — which the target then passes is counted as a pass, not a failure.

  ava reports a passing `test.failing` as `not ok`: from the incumbent's side an unexpected
  pass means a stale annotation to clean up. Read as a verdict on the target it is exactly
  backwards, and it held `slice-ansi` at 14 / 15 for a day on the strength of the one case
  `linegauge` does **better** — it round-trips an `OSC 8` hyperlink, which `slice-ansi`
  cannot.

  The denominator does not move: this is not an exclusion, which would shrink the suite and
  improve the rate without saying why. The case stays in, counted as the pass it is, keyed
  strictly on ava's own diagnostic so nothing else can trip it, and surfaced as `exceeded` on
  the report line — `(1 the host marks failing and we pass)` — because a reclassification
  nobody sees is a grader marking its own homework. A control run cannot reach it: there the
  incumbent really does fail the case and ava prints a plain `ok`.

- [#152](https://github.com/ofri-peretz/burgee/pull/152) [`8fb79f9`](https://github.com/ofri-peretz/burgee/commit/8fb79f934547b81e922dffae47c3e7defe0e6784) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Measure `roundel/tokens` against picocolors in the weight axis. The roadmap's second bet — roundel ships under picocolors' weight — was the only headline comparison with no measured pair, resting instead on a budget of 3,300 described as "the ceiling is picocolors: 3.3 KB". Measured, it is 415 B against picocolors' 2,557 in a user's bundle, and 899 against 2,554 with every token imported.

- [#405](https://github.com/ofri-peretz/burgee/pull/405) [`72ee923`](https://github.com/ofri-peretz/burgee/commit/72ee9230964c28d5279fbf0f9ca430877487ceaa) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A host that pins its suite dependencies gets its runner from that tree, not from the
  workspace.

  `suiteDeps` exists so a suite runs against the versions it was written for, and
  `writeInternalShims` already resolved the incumbent that way; `command()` did not. This repo
  hoists **ava 8.0.1** and meow's suite is written for the **6.4.1** its `suiteDeps` installs,
  under which ava 8 prints `1..0 / # tests 0 / # fail 32` — a suite of zero reported as
  thirty-two failures. ava's CLI entry is also not one filename across its majors: 8 ships
  `entrypoints/cli.js`, 6 ships `entrypoints/cli.mjs`, and its exports map admits neither by
  name, so hardcoding the first killed a 6.x host before a test ran.

  With both fixed, meow's 36 files grade 148 cases at 144 passing against real meow.

- [#115](https://github.com/ofri-peretz/burgee/pull/115) [`4ea1baf`](https://github.com/ofri-peretz/burgee/commit/4ea1bafc3d816347bc427c85740d476c36da3dd7) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - The compatibility grade no longer subtracts a skipped case from a total that never held it. mocha leaves a pending test out of both `# tests` and `# pass`, so the extra subtraction produced `804 passing out of 803 run` — impossible, and wrong in the direction that flatters. Runners that print a skip summary (node:test, ava) still have it subtracted from the denominator, because theirs do count it.

- [#395](https://github.com/ofri-peretz/burgee/pull/395) [`56ebabf`](https://github.com/ofri-peretz/burgee/commit/56ebabf45ef556f72c66edce746a94c6dbda6e33) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - A vendor run that cannot finish no longer damages what is already there.

  It built in place, deleting the host directory first, so a run that produced nothing left the
  host with no suite, no `.source.json` and no `package.json` — which is how `dotenv` lost 141
  graded cases in one run. It now builds into a staging directory and swaps, and refuses
  outright when a run yields no graded file.

  `pinnedVersion` makes a pin readable. `slice-ansi`'s lived only in prose — "vendored at
  7.1.2, not at the 9.0.0 on npm, and that is a deliberate pin" — and a re-vendor moved it to
  9.0.1 anyway, because nothing in the code could read a paragraph.

- [#394](https://github.com/ofri-peretz/burgee/pull/394) [`7ab5ccc`](https://github.com/ofri-peretz/burgee/commit/7ab5ccc908b48208a627d9b339423a5bb0b1f9b2) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `has-ansi` is a declared `suiteDeps` entry rather than a committed
  `vendor/wrap-ansi/node_modules/` directory, so a re-vendor run cannot delete it and take the
  row from 80 / 80 to 0 / 80 — which is what happened on 2026-09-21, against a `.gitignore`
  that had named the hazard in as many words.

- [#406](https://github.com/ofri-peretz/burgee/pull/406) [`d1a193d`](https://github.com/ofri-peretz/burgee/commit/d1a193ddeec01c976a39c8a12fe0430754855189) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `vendor()` writes `PROVENANCE` beside `.source.json`.

  `scripts/vendor-suite.ts` was the only writer of it, and `vendor()` — which `compat --vendor`
  calls — replaces the host directory wholesale. So re-vendoring a host through the oracle
  deleted a file `provenance.test.ts` requires, and the lock then went red on a host nobody had
  edited by hand, naming a file the oracle had removed itself. Both files come from the same
  record; writing one without the other was only ever a division of labour between two callers.
