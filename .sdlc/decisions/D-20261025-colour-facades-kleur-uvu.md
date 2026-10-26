---
id: D-20261025-colour-facades-kleur-uvu
subject: 'colour-facades R1: how does compat-oracle grade a suite run by `uvu -r esm`, which entries of kleur does the drop-in cover, and what do they weigh?'
taken: 'uvu runs once per file and is graded by the summary it prints, with tsx standing where `-r esm` stood; both of kleur''s entries are graded, `roundel/kleur` and `roundel/kleur/colors`, 15 / 15 against a control of 15 / 15, at 1,049 B against 1,839 and 930 against 997; budgets set at the measurement, none raised (2026-10-25)'
date: '2026-10-25'
superseded_by: —
---

**The runner reads uvu's summary.** kleur's `npm test` is `uvu -r esm -i utils -i xyz` over the
repository root. uvu's CLI requires every file, runs every `test()` registered, prints `Total`,
`Passed` and `Skipped` on stdout, and exits 1 when a case failed. So `runner: 'uvu'`
(`compat-oracle/src/uvu.ts`, spawned by `runUvuFiles` in `run.ts`), on the twist arm's pattern
(D-20261020-colour-facades-colorette-twist):

- **uvu's own CLI, pinned beside the suite** (`suiteDeps: ['uvu@0.3.3']`), and refused when it is
  not pinned.
- **One spawn per file**, the test directory and a pattern matching that one file, because a file
  uvu cannot load throws out of its CLI before any summary and would zero the whole suite.
- **A summary is the file's counts whatever the exit code**; a non-zero exit with no summary is
  one failure of that file; an exit 0 with no summary, or a killed run, is an error. `Skipped` is
  outside uvu's `Total` and is carried as node:test's dialect carries it.
- **No exclusions**: uvu names failing cases only.

**`-r esm` is substituted by tsx.** `esm` 3.2.25 does not start on Node 24 (`Cannot use import
statement outside a module`, the spec's re-grounding 3). What it gave kleur's suite was ES module
syntax in `.js` files under a root with no `type`, `./utils` resolved to `./utils.js`, and `uvu`
resolved to the CommonJS build uvu's CLI queues on — through the `import` condition `test.run()`
reaches a second uvu, whose queue the CLI never reads, and throws (measured). tsx does all three,
and is the substitution `Host.tsLoader` already makes for signal-exit's `ts-node/esm`, so the uvu
arm takes the same `--import` ahead of uvu's CLI and no new mechanism is added. The vendor step
learned one thing for it: a sibling named with no extension (`./utils`) is copied as `<name>.js`,
which is how CommonJS and `esm` resolve it.

**Both entries are graded.** kleur publishes `.` and `./colors`, and the two files `npm test` runs
are one each (`test/index.js`, 8 cases; `test/colors.js`, 7). Grading one would be a selective
reading of upstream's own suite, and a program on `kleur/colors` would be left with no drop-in. So
the drop-in is `roundel/kleur` and `roundel/kleur/colors`, two `HostImport`s on one host, two
`DROP_INS` rows and two B4 pairs; each module keeps its own switch, as kleur's two modules do.
`test/env.sh` is not graded: it is upstream CI's separate Linux step (`script -qfc`), not
`npm test`, and its rows are the decision tables of `kleur.test.ts` and `kleur-colors.test.ts`.

**Budgets, none raised.** B4 `roundel/kleur` 1,150 (1,036 measured against kleur's 1,847 for a
program importing the default, 0.561) and `roundel/kleur/colors` 750 (621 against 688 for one
importing `red`, 0.903), each the measurement plus the 80 B CI margin rounded up to the next fifty,
red at 0 first. `DROP_IN_CEILINGS` 1,839 and 997, kleur's surfaces by the weight page's method,
against 1,049 and 930 for ours. roundel's `weight.test.ts` budgets `./kleur` 2,200 and
`./kleur/colors` 1,750 of reachable `dist` (measured 2,164 and 1,717 with `runtime.js`). roundel's
tarball grows to 41,504 B gzipped and 129,929 unpacked (+5.5% and +7.2% on the
D-20261025-roundel-tarball-colorette baseline), inside the 10% allowance, so that baseline is not
moved.

**Alternatives rejected.**

- *A resolve-and-load hook written for `esm`* (built first, and graded 15 / 15 too): it ran the
  files as real ES modules rather than transpiled, but it was a second loader mechanism beside
  `tsLoader` for a suite tsx already loads, and twenty lines of hook to keep and mutate.
- *One uvu run over both files.* Upstream's shape, but one failed import zeroes both.
- *Grading `kleur` alone.* Half of upstream's `npm test`, and half of kleur's published surface.
