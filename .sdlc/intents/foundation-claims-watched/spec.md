# Design — The foundation's published numbers are watched and benchmarked

Intent: [`intent.md`](./intent.md). **Status:** shipped (2026-10-26).

**Accepted by the owner, 2026-10-12, by instruction: create and execute.** The instruction and the
evidence are recorded in [`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md).

---

## Requirements

- **R1 — The list grows first.** `KNOWN` gains every incumbent in `foundation-ceilings.json`, plus
  lilconfig, tinyexec, onetime, cli-cursor, cli-truncate, widest-line, find-up, meow, ink and
  `@inkjs/ui`. The lock's existing "every cited competitor is declared" assertion then fails for
  the six packages, which is the red this intent starts from.
- **R2 — `seniority` and `bellpull` declare.** One `competitors.json` each, per subpath, with
  `claim` `compat` where `GRADED` has a row and `weight` where only a figure is cited. `seen` is
  `null` until the watch fills it (superseded by R7: the watch never fills it).
- **R3 — `closeout` and `linegauge` declare.** The same, for their subpaths.
- **R4 — `paratext` and `controlroom` declare.** The same. `controlroom/ink` declares ink and
  `@inkjs/ui` as `compat`.
- **R5 — Every published package must declare.** The lock adds the upstream-watch success
  criterion as an assertion: a package that is published (has a version and is not private)
  and has no `competitors.json` fails.
- **R7 — A declared competitor holds a fingerprint.** *Added 2026-10-26.* R2's "`seen` is
  `null` until the watch fills it" was wrong: the daily pass is read-only and `moved()` is false
  with nothing held, so a null `seen` is a competitor no release of which is ever reported. The
  lock fails on one, keyed as the watch keys it (npm package and `via`), and
  `npm run compat -- --fingerprint --missing` fills the holes without re-recording a held
  fingerprint ([D-20261026-fingerprint-missing-not-rerecord](../../decisions/D-20261026-fingerprint-missing-not-rerecord.md)).
- **R6 — Two B4 pairs per package.** `PAIRS` gains `seniority/lilconfig ÷ lilconfig`,
  `seniority/dotenv ÷ dotenv`, `closeout/exit-hook ÷ exit-hook` and `closeout/signal-exit ÷ signal-exit`.
  Each gates at 1 when it measures under 1, and as a ratchet at its measurement when it does
  not, with a `weight.ts` comment saying which.

## Design

R1–R5 are data and one assertion. The watch already iterates every `competitors.json` it
finds, so no workflow changes. R6 reuses the pair machinery as the other eight packages do.
Fixtures import the default export on both sides where the incumbent has one, so the
comparison is like for like.

Order: R1 with R2 (the lock goes red, then green within the PR), R3, R4, R5 last of the
declarations, then R6 in its own PR.

## Verification

| R | Check | Shown failing first by |
| :-- | :-- | :-- |
| R1–R4 | `scripts/competitors-lock.test.ts` | widening `KNOWN` alone makes the citation assertion fail for each of the six READMEs that name an incumbent beside a figure |
| R5 | the same file, new case | before the six files exist, it lists them |
| R6 | `npm run bench -- --axis weight --check`; `benchmarks/weight.test.ts` | the pair is added with a placeholder ceiling of 0, which fails, before the measured ceiling is set |
| R7 | `scripts/competitors-lock.test.ts` › `every declared competitor holds a fingerprint…`; `compat-oracle/src/watch.test.ts` and `report.test.ts` (`--missing`) | on `3d079b15cc` the lock lists 29 competitors, and the `--missing` cases fail before the option exists |
| watch | `node packages/compat-oracle/dist/bin.js --competitors`, read-only against the live registry | before: `29 competitor(s) hold no fingerprint yet` (scheduled run 40189508824, 2026-10-25) |

## Rejected alternatives

- **One central competitors file for the foundation.** upstream-watch decided per-package
  files (D-039), so a deleted package takes its competitors with it.
- **Make the foundation incumbents hosts.** Most are already hosts for grading. The competitor
  entry is a separate, lighter declaration (D-042), and mixing the two was rejected there.
- **Gate the exit-hook pair at 1 and let it fail.** If it measures over 1, the failing gate is
  a known state, not news. A ratchet at the measurement stops it growing, and the README states
  the comparison honestly, as `paratext` does.

## Out of scope

- Changing `upstream-watch`'s own status. That is a status correction listed in
  `next-wave-3-2026-10.md` step 0, not part of this design.
- Re-measuring and rewriting `foundation-ceilings.json` itself (`npm run weight:converge` owns
  it). The watch reports a moved incumbent, and a person decides.
- Runtime pairs for seniority and closeout. Weight is the published claim. Speed is unmeasured,
  and is stated as such.

## Status

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** 2026-10-12 | `scripts/competitors-lock.test.ts`: `KNOWN` gains the 24 names (every `foundation-ceilings.json` incumbent, plus lilconfig, tinyexec, onetime, cli-cursor, cli-truncate, widest-line, find-up, meow, ink and `@inkjs/ui`), and a new case holds success criterion 2. **Three departures from the design.** (1) The citation assertion only reads packages that already have a `competitors.json`, so widening `KNOWN` alone could not fail for the six. What it did turn red was the four that declare: burgee cites meow, caique cites `@inquirer/core` and ansi-escapes, flagstaff cites ansi-escapes. Those are now declared (`burgee` `./meow`; `caique` `./inquirer` as `inquirer-core`; `flagstaff` ansi-escapes `via` log-update, which log-update 8.0.0 depends on). Caique's two ansi-escapes mentions are incidental and were reworded to `paratext/csi`. (2) `which` is an English word, and it matched beside a figure in nine of ten packages. `CODE_ONLY` makes it a citation only when it is written as code. (3) A declaration covers its npm name as well as its host name (`npmNameOf`, as the watch fetches), because a `compat` claim must name the `hosts.ts` host (`inkjs-ui`, `inquirer-core`) while a README writes `@inkjs/ui` | `competitors-lock.test.ts` › `every incumbent a foundation ceiling is measured from is known and declared`, and the per-package citation case. Red: `no package declares @inquirer/core, ansi-escapes, cosmiconfig, cross-spawn, dotenv, execa, exit-hook, rc, restore-cursor, strip-ansi, term-img, terminal-link, which`; `burgee publishes a figure against meow`; `caique … against ansi-escapes, @inquirer/core`; `flagstaff … against ansi-escapes` |
| R2 | **Built** 2026-10-12 | `packages/seniority/competitors.json` (`.` cosmiconfig, `./dotenv`, `./lilconfig`, `./rc`, `./find-up`, each `compat`); `packages/bellpull/competitors.json` (`.` execa and tinyexec as `weight`, since no drop-in replaces either; `./cross-spawn` and `./node-which` as `compat`). **The root `.` was not a subpath to the watch or to the lock.** Both read only `./` keys, so a root declaration would have been silently unwatched. `readDeclarations` in `compat-oracle/src/competitors.ts` and the lock now read `.` too. Reading it surfaced caique's `.` clack entry: a `seen` of 101,684 B for 1.8.0 written by hand on 2026-09-09, with no tarball behind it, which neither the watch nor the lock had ever read. It is now `seen: null`, so the daily pass measures it | `competitors-lock.test.ts` (all cases); `compat-oracle/src/competitors.test.ts` › `` reads only subpaths (the root `.` or a `./` path)… ``. Red: `seniority publishes a figure against cosmiconfig and watches it nowhere`, `no package declares cosmiconfig, execa` (with `.` unread); the oracle case `expected { './ora': [ { …(3) } ] } to deeply equal { '.': [ { …(3) } ], …(1) }`; `caique holds a fingerprint that cannot be traced to a tarball: clack` |
| R3 | **Built** 2026-10-12 | `packages/closeout/competitors.json` (`./signal-exit`, `./exit-hook`, `./restore-cursor`, `./onetime`, `./cli-cursor` as `compat`; mimic-function `weight` `via` onetime, the tree closeout's weight lock itemises); `packages/linegauge/competitors.json` (`.` string-width, `./strip`, `./wrap`, `./slice`, `./cli-truncate`, `./widest-line`, each `compat`) | `competitors-lock.test.ts`. Red: R5's case, below |
| R4 | **Built** 2026-10-12 | `packages/paratext/competitors.json` (`.` ansi-escapes, `./terminal-link`, `./term-img`, each `compat`); `packages/controlroom/competitors.json` (`./ink`: ink, and `inkjs-ui` with `registry: "@inkjs/ui"`, both `compat`) | `competitors-lock.test.ts`. Red: `paratext publishes a figure against ansi-escapes and watches it nowhere` (with `.` unread), and R5's case |
| R5 | **Built** 2026-10-12 | `competitors-lock.test.ts` › `every published package declares its competitors` (not `private`, has a version) | the same case. Red, before the six files: `bellpull, closeout, controlroom, linegauge, paratext, seniority are published and declare no competitors.json` |
| R6 | **Built** 2026-10-12 | `benchmarks/fixtures/entry-points.ts` (four `PAIRS`, incumbents at the versions compat-oracle grades: lilconfig 3.1.3, dotenv 18.0.7, exit-hook 5.1.0, signal-exit 4.1.0, pinned exactly in `benchmarks/package.json`, which now declares `seniority` and `closeout` too); `benchmarks/axes/weight.ts` (`BUNDLED_CEILING` at the measurement plus the 80 B CI margin, rounded up to the next fifty). Measured: `seniority/lilconfig` 3,263 B against 5,343 (0.611) and `seniority/dotenv` 5,913 against 11,481 (0.515), both gated at 1; `closeout/exit-hook` 4,819 against 1,645 (**2.929**) and `closeout/signal-exit` 3,634 against 2,856 (**1.272**), both heavier and ratchets at the measurement (2.98 and 1.31), with a gap each: [B-20261012-closeout-bundles-heavier-than-exit-hook](../../gaps/B-20261012-closeout-bundles-heavier-than-exit-hook.md), [B-20261012-closeout-heavier-than-signal-exit](../../gaps/B-20261012-closeout-heavier-than-signal-exit.md). `/docs/benchmarks` is generated from the published measurement (`benchmarks/published.ts`), so the four rows and the two *not met* claims reach it when the next CI run is promoted | `npm run bench -- --axis weight --check`; `benchmarks/weight.test.ts`. Red, with every ceiling at 0: `6 gate failure(s)` — the four `bundled-bytes … is above its ceiling of 0`, and `closeout/exit-hook ÷ exit-hook bundled-bytes-ratio: 2.929 ratio is above its ceiling of 1`, `closeout/signal-exit ÷ signal-exit … 1.272` |

| R7 | **Built** 2026-10-26 | `scripts/competitors-lock.test.ts` › `every declared competitor holds a fingerprint, so a release of it is noticed` (via compat-oracle's own `readDeclarations` and `watchList`); `fingerprint(…, { missing })` in `compat-oracle/src/watch.ts` and `--fingerprint --missing` in `report.ts`; the 29 readings, taken from the live registry on 2026-10-26 and committed in eight `competitors.json` files. caique's `.` clack stays `null`: it shares its watch with `./ask`'s, which holds 1.8.1 | Red on `3d079b15cc`: `@inkjs/ui, @inquirer/core, ansi-escapes, ansi-escapes<log-update, cli-cursor, cli-truncate, cosmiconfig, cross-spawn, dotenv, execa, exit-hook, find-up, ink, lilconfig, meow, mimic-function<onetime, onetime, rc, restore-cursor, signal-exit, slice-ansi, string-width, strip-ansi, term-img, terminal-link, tinyexec, which, widest-line, wrap-ansi are declared and hold no fingerprint`; and four unit cases: the `missing` workspace case and the `--missing` hint line in `watch.test.ts`, and the two `--fingerprint` cases in `report.test.ts` |

**Built: 7.**

### Shipped 2026-10-26

All four success criteria hold, read against `main` at `3d079b15cc`:

1. **Ten of ten declare.** `competitors-lock.test.ts` › `every published package declares its competitors`.
2. **Every ceiling incumbent declared and on `KNOWN`.** The same file, `every incumbent a foundation ceiling is measured from is known and declared`.
3. **Every competitor fingerprinted** (restated, R7). `npm run compat -- --fingerprint --missing` on
   2026-10-26 recorded 29 releases, among them lilconfig 3.1.4 (11,672 B), tinyexec 1.3.1 (12,796 B),
   exit-hook 5.1.0 (4,458 B), signal-exit 4.1.0 (21,983 B), dotenv 18.0.9 (11,149 B) and
   cosmiconfig 10.0.1 (620,558 B across 4). The read-only pass the scheduled job runs then reported
   55 watches: 53 up to date, **0 with no fingerprint**, and 2 moved, `inquirer` 14.2.3 → 14.2.4 and
   `@inquirer/prompts` 8.7.3 → 8.7.4, which are issues #1195 and #1224 and were left held on purpose.
   The first scheduled run after merge reads the same way, with no "hold no fingerprint yet" line.
4. **Four gated pairs.** `benchmarks/results/cli-benchmarks/2026-10-26-e739f18-ci.json`:
   `seniority/lilconfig ÷ lilconfig` 0.612, `seniority/dotenv ÷ dotenv` 0.516,
   `closeout/exit-hook ÷ exit-hook` 0.960 and `closeout/signal-exit ÷ signal-exit` 0.930, each
   gated at 1. The two closeout ratchets in R6 were retired by `closeout-at-incumbent-weight`.

These byte figures are not `foundation-ceilings.json`'s. The band measures an `npm i` tree with
`installedBytes`, and the watch weighs the registry tarballs, so cosmiconfig reads 1,832,269 B in one
and 620,558 B in the other. Neither is rewritten here (out of scope, above).

No Quint model: R7 adds no state. The `seen` record already existed, and `--missing` is a filter
over the same write.
