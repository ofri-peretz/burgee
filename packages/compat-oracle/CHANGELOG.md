# compat-oracle

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
