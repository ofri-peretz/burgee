# Adoption barriers — 2026-10-18

What stops a maintainer from moving a commander or yargs CLI, and its output stack, to burgee
and the family. Every number here comes from a run, a registry read or a clone, with its sample
size. Where something could not be measured, the last section says so and says why.

This extends the research that already exists rather than redoing it:
[`migration-drivers.md`](./migration-drivers.md) (why communities migrate),
[`dependents.md`](./dependents.md) (who the targets are),
[`competitor-open-issues.md`](./competitor-open-issues.md) and
[`output-stack-open-issues.md`](./output-stack-open-issues.md) (incumbent backlogs), and
[`D-20261008-migrate-u12-findings`](../decisions/D-20261008-migrate-u12-findings.md) (the first
trial, on two CLIs). The raw data is in [`adoption-barriers/`](./adoption-barriers/).

## The answer in five lines

1. **`burgee migrate` does nothing for most CLIs, because they are not on the incumbent's latest
   major.** 83.7% of the commander and yargs dependents sampled (1,860 of 2,223) are on an older
   major. Even once [`previous-majors`](../intents/previous-majors/intent.md) lands, 56.7% still
   are. In the field trial migrate left 5 of 9 CLIs untouched for this reason. When the import was
   moved by hand anyway, 4 of those 5 CLIs crashed on start-up, and 3 of those 4 kept a green test
   suite.
2. **The Node floor is the second wall.** 32.4% of dependents are CommonJS-only and still allow
   a Node that cannot `require()` an ES module. 65.2% of those that declare `engines.node` allow
   a Node below burgee's `^20.19.0 || >=22.13.0`. migrate never mentions it.
3. **TypeScript on `moduleResolution: node10` cannot see the subpath types.** That is 38.8% of
   TypeScript dependents. It cost the 2 TypeScript CJS CLIs in the trial their typecheck
   (`TS2307`).
4. **Trust and weight discourage adoption, but nothing breaks on them.** burgee is six weeks old,
   has one human author, no outside dependent, and released 6 minors in 8.7 days. Its install is
   8.2x commander's.
5. **What the U12 trial found is mostly fixed.** Mocks move, `--only`/`--skip` exist, partial runs
   hold, and reports summarise. One new defect turned up: under a release age, `next` pinned a
   roundel that predates `roundel/picocolors`, and the migrated svgo would not start.

## Method

Three parts, all run on 2026-10-18 on Linux with Node v22.22.0, npm 10.9.4, pnpm 10.28 and the
project's own `packageManager` pnpm where one is pinned.

### Part A — field trial

- **Projects.** 9 open-source CLIs we did not write. They were picked to cover:
  - commander (6) and yargs (3);
  - ESM (4) and CommonJS (5);
  - TypeScript (4) and JavaScript (5);
  - vitest (4), jest (2), mocha (2), ava (1) and tap (1);
  - npm (5) and pnpm (4);
  - one monorepo (`swc-project/pkgs`);
  - suites that `vi.mock` an incumbent (nest-cli);
  - `engines.node` below the floor (5 of 9).

  Each was cloned at the pinned SHA in the table below into a scratch directory. **Nothing was
  pushed, opened or commented on any external repository.**
- **Arms.** Each project ran in a fresh copy per arm:
  - `base`: install, build, typecheck, tests, `--help`, and `--version` cold start.
  - `mig`: install, then the **published** `burgee@1.6.0` `migrate --json`, then the `next`
    command it printed run exactly as printed, then the same steps.
  - `manual`: only where migrate declined an off-major incumbent. The specifier was moved by hand
    (`commander` → `burgee/commander`, `yargs` → `burgee/yargs`) with `burgee` installed. This arm
    is not something migrate does. It measures what a supported older-major path would still have
    to survive.
- **Cold start.** `node <bin> --version`, one warm-up, then 10 runs interleaved between the two
  arms, median. Measured sequentially after every other run had finished.
- **Footprint.** Each incumbent and each drop-in was installed alone into an empty directory with
  `npm i --omit=dev`. The bundled bytes come from a one-file program per entry, built with
  `esbuild --bundle --minify`.
- **Runtimes.** Node 18.20.4, 20.20.0 and 21.7.3, for the floor.

### Part B — population

- **Frame.** The npm search API for `keywords:cli` and `keywords:command-line`, at `size=250` and
  offsets 0 to 5,000. The API caps the offset at 5,000, so `keywords:cli` is its top 5,250 by
  search score and `keywords:command-line` is complete.
- **Packages.** 9,198 names. Each one's latest manifest was read, and the 2,215 that list
  `commander` or `yargs` under `dependencies` were kept. 1,876 list commander and 347 list yargs;
  8 list both, so per-host rows total 2,223. This is the **random** stratum.
- **Popular stratum.** The 100 packages in `dependents.json`, kept separate.
- **What was measured where.**
  - Manifest measures cover every package.
  - Published tarballs were scanned for 2,177 of the 2,215.
  - Source measures (tsconfig, mocks, help snapshots) come from shallow sparse clones of a seeded
    random 300 with a GitHub repository. 272 clones succeeded; 28 repositories are gone or
    private.
- **Intervals.** Wilson 95%.
- **Bias.** This is every commander or yargs dependent inside a CLI-tagged search frame. It is not
  a uniform sample of all 150,896 commander dependents, and the intervals describe the frame.

### Part C — trust and social

- **npm registry.** `time`, `maintainers`, `dist.attestations`, and search's own download and
  dependents counts.
- **Commit history.** A blob-less clone of each repository, for 12 months of commits and authors.
- **Issue themes.** The issue snapshots in [`issues/`](./issues/), regrouped by migration pain.

## Part A — the field trial

### What U12 found, on `main` today

| U12 finding | Fixed? | Evidence in this trial |
| :-- | :-- | :-- |
| U12-1 `vi.mock('chalk')` not rewritten | **yes** | nest-cli: 4 `vi.mock('ora', …)` calls moved with the source. Its tests were 1,096 / 1,097 before and after (`U12-1` in `packages/burgee/src/migrate-u12.test.ts`). |
| U12-2 unpinned install | **yes, with a new defect** | `next` is pinned and honours svgo's `minimumReleaseAge: 10080`. The pin it chose, `roundel@^1.0.4`, predates `./picocolors` (first in 1.1.0), so svgo's CLI no longer starts. This is barrier 7. |
| U12-3 no `--only` / `--skip` | **yes** | `--skip=cli-table3` on nest-cli removed the refusal. |
| U12-4 partial migration split `instanceof` | **yes** | nest-cli: commander was held because `@swc/cli` also depends on it and a test imports `CommanderError`. |
| U12-5 no summary | **yes** | Every report opens with `complete`, `partial` or `nothing to rewrite`. |
| install bytes went up | **no, and worse** | burgee plus its dependencies is 1,706,711 B against commander's 207,795 B (U12 measured 1.21 MB). [`D-20261008-install-bytes`](../decisions/D-20261008-install-bytes.md) keeps this on purpose and reopens only if a measured adopter declines. |

### Table

The suffix after the counts is passed / total. `—` means the project has no such step.
"migrate" is the summary line of the published `burgee migrate`.

| Repo | SHA | Incumbent (range) | Shape | migrate | install | build | typecheck | tests base → after | `--help` | Failures by class |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| [concurrently](https://github.com/open-cli-tools/concurrently) | `3ec91b28` | yargs `18.0.0`, chalk `5.6.2` | ESM · TS · vitest · pnpm · node ≥22 | complete: 1 file | ok | ok | ok | 643/643 → 643/643 | identical | none. chalk 5 left alone, off-major (graded 6) |
| [postcss-cli](https://github.com/postcss/postcss-cli) | `03e8cee3` | yargs `^18`, picocolors | ESM · JS · ava · npm, no lockfile | partial: 1 file, 1 refused (exit 1) | ok | — | — | 46 → 46 | identical | **refusal**: 4 non-literal `import(plugin)` in `index.js` hold picocolors |
| [nest-cli](https://github.com/nestjs/nest-cli) | `08d8f3c9` | commander `15.0.0`, ora `9.4.1`, cli-table3, @inquirer/prompts | ESM · TS · vitest, mocks `ora` · npm · node ≥20.11 | partial: 4 files, 1 refused (exit 1) | ok | ok | ok | 1,096/1,097 → 1,096/1,097 | identical | **refusal**: `TableConstructorOptions` unknown export of cli-table3; **identity hold**: commander held through `@swc/cli`; **not level**: @inquirer/prompts 100/213 |
| [svgo](https://github.com/svg/svgo) | `e4cb29be` | commander `^11.1.0`, picocolors | ESM · JS with `.d.ts` · vitest · pnpm, `minimumReleaseAge` 7 d · node ≥16 | complete: 3 files | ok | ok | **3 × TS2307** | 520/523 → **497/506, 6 failed, 3 files** | **crashes** `ERR_PACKAGE_PATH_NOT_EXPORTED` | **release-age pin**: `roundel@1.0.4` has no `./picocolors`; **off-major**: commander 11 |
| svgo `manual` | 〃 | commander 11 → `burgee/commander` | 〃 | — | **`burgee@^1.6.0` refused by the 7-day age**; `burgee@~1.1.0` ok | ok | ok | 520/523 → 520/523 | 8 of 38 lines re-wrapped | **help drift**: byte-identical to real commander 15. It is commander 11→15's own change, not burgee's |
| [wait-port](https://github.com/dwmkerr/wait-port) | `16083537` | commander `^9.3.0`, chalk `^4.1.2` | CJS · JS · mocha · npm · node ≥10 | nothing to rewrite (off-major) | ok | — | — | 36/40 → 36/40 ¹ | identical | **off-major** ×2; **floor**: ≥10 not reported |
| wait-port `manual` | 〃 | commander 9 → `burgee/commander` | 〃 | — | ok | — | — | 36/40 → 36/40 | **crashes** `program.version is not a function` | **old-major API**: `require('commander')` used as the program (commander ≤11). The tests stayed green |
| [madge](https://github.com/pahen/madge) | `456057b8` | commander `^7.2.0`, chalk 4, ora 5, rc | CJS · JS · mocha · npm · node ≥18 | partial: 0 files, 1 refused (exit 1) | ok | — | — | 54/58 → 54/58 ¹ | identical | **off-major** ×3; **refusal**: `require(path.join(cwd, 'package.json'))` |
| madge `manual` | 〃 | commander 7 → `burgee/commander` | 〃 | — | ok | — | — | 54/58 → 54/58 | **crashes** `storeOptionsAsProperties is not a function` | **old-major API**: `require('commander')` used as the program (commander ≤11), as in wait-port's row. The crash is at `bin/cli.js:14` (`field-trial.json` › `madge.arms.manual.help.firstLine`), `program.storeOptionsAsProperties()`, the first use of line 6's `const program = require('commander')`. commander never removed that method: its CHANGELOG through 15.0.0 has no such entry, and burgee's `Command` has it. *Corrected 2026-10-19; this cell said "removed in commander 13".* The tests stayed green |
| [tsc-alias](https://github.com/justkey007/tsc-alias) | `1077308b` | commander `^9.0.0` | CJS · TS `node` resolution · jest · pnpm · node ≥16.20 | nothing to rewrite (off-major) | ok | ok | ok | 75/75 | — | **off-major** |
| tsc-alias `manual` | 〃 | commander 9 → `burgee/commander` | 〃 | — | ok | **TS2307** (emits) | **TS2307** | 75/75 → **41/75** | **crashes**: short flag `-fe` refused | **types**: node10 cannot see `burgee/commander`; **old-major API**: multi-character short flag (an error since commander 13) |
| [node-qrcode](https://github.com/soldair/node-qrcode) | `3848ed2c` | yargs `^15.3.1` | CJS · JS · tap · rollup · npm · node ≥10.13 | nothing to rewrite (off-major) | ok ² | ok | — | pass → pass | identical | **off-major**; **floor**: ≥10.13 not reported |
| qrcode `manual` | 〃 | yargs 15 → `burgee/yargs` | 〃 | — | ok | ok | — | pass → pass | **crashes** `yargs.detectLocale is not a function` | **old-major API**: yargs ≤17 singleton (`require('yargs').option(…)`). The tests stayed green |
| [@swc/cli](https://github.com/swc-project/pkgs) | `2cbd4700` | commander `^8.3.0` | monorepo · TS `module: commonjs` · jest · pnpm · node ≥20.19 | **refused: dirty tree** (install wrote `node-compile-cache/`); with `--force`: nothing to rewrite | ok | ok | ok | 37/37 | — | **dirty tree after install**; **off-major** |
| @swc/cli `manual` | 〃 | commander 8 → `burgee/commander` | 〃 | — | ok | **TS2307** ×2 | **TS2307** ×2 | 37/37 → **1 suite fails to load**, 17/17 of the rest | identical (the runtime `require(esm)` works) | **types**: node10; **jest**: `Cannot use import statement outside a module`. Jest's CJS loader does not do `require(esm)` |

¹ The 4 failures are the same IPv6 or graphviz cases in both arms; this container has no IPv6
and no `dot`. ² `npm ci --ignore-scripts`: the `canvas` devDependency needs a native build that
this container cannot do.

### Failures by class, counted over the 9 projects

| Class | Projects | Where |
| :-- | --: | :-- |
| migrate declined an off-major incumbent | **5 / 9** | wait-port, madge, tsc-alias, qrcode, @swc/cli. migrate is a no-op for every one of them |
| that CLI crashed once the specifier moved by hand | **4 / 5** | wait-port, madge, tsc-alias, qrcode. Each crash is an API the incumbent itself removed in a later major |
| …while its own test suite stayed green | **3 / 4** | wait-port, madge, qrcode. Their suites never start the binary |
| `engines.node` below burgee's floor, and the report never says so | **5 / 9** | wait-port ≥10, qrcode ≥10.13, svgo ≥16, tsc-alias ≥16.20.2, madge ≥18 |
| TS2307 under `node10` resolution | **2 / 2** TS CommonJS projects | tsc-alias, @swc/cli |
| a file refused, holding an incumbent | **3 / 9** | postcss-cli and madge (non-literal specifier), nest-cli (a type export cli-table3's drop-in lacks) |
| an incumbent held because a dependency shares its classes | 1 / 9 | nest-cli: commander through `@swc/cli` |
| the `next` pin lacks the drop-in's subpath | 1 / 1 project with a release age | svgo |
| the current burgee refused by a release age | 1 / 1 | svgo (`burgee@^1.6.0` under 7 days) |
| jest cannot load the ESM-only drop-in | 1 / 2 jest projects that load it in-process | @swc/cli |
| migrate refused a tree that `pnpm install` itself dirtied | 1 / 9 | @swc/cli |
| help text differs from the project's own incumbent | 1 (svgo, 8 of 38 lines) | the incumbent's own major change. burgee matches commander 15 byte for byte |
| a mock of the incumbent left behind | **0** | U12-1 holds |
| cold start got worse by more than run-to-run noise | **0** | see below |

### Footprint and cold start

Each package was installed alone in an empty directory; the raw data is in
[`footprint.json`](./adoption-barriers/footprint.json).

| Swap | before: packages / bytes | after: packages / bytes | bytes ratio |
| :-- | :-- | :-- | --: |
| commander 15 → burgee 1.6.0 | 1 / 207,795 | 6 / 1,706,711 | **8.2x** |
| yargs 18 → burgee 1.6.0 | 15 / 543,418 | 6 / 1,706,711 | 3.1x |
| ora 9 → flagstaff 1.7.0 | 17 / 293,338 | 5 / 717,107 | 2.4x |
| picocolors → roundel 1.1.1 | 1 / 6,745 | 1 / 114,013 | 16.9x |
| commander + chalk + ora + cli-table3 + @inquirer/prompts → burgee + roundel + flagstaff + caique | 49 / 1,562,860 | 9 / 2,337,073 | 1.5x |

Bundled with esbuild and minified (gzip in brackets):

| entry | incumbent | drop-in |
| :-- | :-- | :-- |
| commander | 39,177 B (11,200) | `burgee/commander` **76,373 B (24,804)** |
| yargs | 112,405 B (34,302) | `burgee/yargs` 123,672 B (42,519) |
| chalk | 6,745 B (2,987) | `roundel/chalk` 4,783 B (2,615) |
| picocolors | 2,556 B (996) | `roundel/picocolors` 1,549 B (833) |
| ora | 59,454 B (15,317) | `flagstaff/ora` 55,754 B (14,734) |

`--version` cold start on the real CLIs, median of 10 paired runs (from
[`coldstart.json`](./adoption-barriers/coldstart.json)):

| CLI | before | after |
| :-- | --: | --: |
| concurrently (yargs → `burgee/yargs`) | 328.0 ms | 291.4 ms |
| postcss-cli (yargs → `burgee/yargs`) | 225.0 ms | 181.3 ms |
| nest-cli (ora → `flagstaff/ora`) | 942.7 ms | 985.3 ms |
| svgo (commander 11 → `burgee/commander` 1.1.0) | 369.8 ms | 347.6 ms |

A one-file commander program on its own is 77.8 ms with commander and 108.1 ms with
`burgee/commander`. Inside a real CLI that difference is lost in the CLI's own start-up, so
**cold start is not a measured barrier**.

## Part B — population shares

The random frame is n = 2,215 unique packages: 1,876 list commander and 347 list yargs. 8 list
both, which gives 2,223 per-host observations. The majors rows use 2,223 as their denominator;
every other row counts packages, out of 2,215. The popular stratum is the 98 live
packages of `dependents.json`. Intervals are Wilson 95%.

| Barrier | Random frame | commander | yargs | Popular |
| :-- | :-- | :-- | :-- | :-- |
| **not on the major migrate claims** (commander 15, yargs 18) | **83.7%** (1,860 / 2,223) | 84.8% | 77.5% | 85.7% / 64.7% |
| …and older than the previous major too (≤13 / ≤16) | **56.7%** (1,261 / 2,223) | 61.1% (58.9–63.3) | 33.1% (28.4–38.3) | 57.1% / 23.5% |
| CommonJS-only (manifest) | 35.4% (33.4–37.4) | 31.4% | 57.6% | 53.1% (43–63) |
| published code `require()`s the host | 36.9% of 2,177 | 32.9% | 59.4% | 56.7% |
| `engines.node` allows below 20.19, of the 68.8% that declare it | **65.2%** (62.7–67.5), n = 1,524 | 65.1% | 65.4% | 49.4% (39–60) |
| …below 18 | 17.7% | 15.0% | 34.6% | 32.9% |
| **CJS-only and engines allow below 20.19 or are absent** | **32.4%** (30.4–34.4) | 28.6% | 53.3% | 40.8% (32–51) |
| TypeScript in devDependencies | 60.4% | | | 37.8% |
| TS with `node10` / `classic` resolution, of TS repos cloned | **38.8%** (31.8–46.3), n = 170 | 23.8% (n = 105) | 63.1% (n = 65) | 58.5% (n = 53) |
| …of all repos cloned | 25.8% (n = 272) | | | 37.3% |
| jest in devDependencies | 12.5% (11.1–13.9) | | | 9.0% |
| jest and CJS-only | 8.3% (7.2–9.5) | | | 7.0% |
| a bundler in devDependencies | 28.3% | | | 23.5% |
| the host inlined into the published bundle | 4.3% | | | 0% |
| tests mock commander or yargs | 1.5% (0.6–3.7), 4 / 272 | | | 0 / 98 |
| tests mock chalk, ora, inquirer or prompts | 9.2% | | | 4.1% |
| tests snapshot `--help` | 1.1%, 3 / 272 | | | 5.1% (5 / 98: cypress, commitlint, stryker…) |
| also depend on chalk / ora / inquirer / any prompt library | 41.9% / 19.7% / 16.7% / 35.4% | | | 19.4% / — / — / 17.3% |

Weighted by weekly downloads, CJS-only is 43.3% of the frame. 58.4% of commander downloads in the
frame sit on a major older than 14. Three packages, html-minifier-terser, @commitlint/cli and
webpack-cli, are about 37% of the frame's 61.7 M weekly downloads, so the weighted shares lean on
them.

### What the trackers say blocked past switches

The 500 issues in [`issues/`](./issues/) and [`issues/output-stack/`](./issues/output-stack/)
were regrouped by migration pain. That gave 47 distinct issues and 97 reactions; the per-issue
list is in `trust.json` under `issue_themes_curated`.

| Theme | Issues | Reactions | For example |
| :-- | --: | --: | :-- |
| ESM / CommonJS breakage on upgrade | 21 | 51 | picocolors #70 (35 reactions); yargs #2479, #1934, #1948; six declined CommonJS requests on chalk; ora #239 |
| types broken by an upgrade | 8 | 9 | clack #600, ora #260, chalk #613 |
| switching library | 8 | 18 | enquirer → clack, chalk → picocolors |
| behaviour regression on upgrade | 6 | 14 | |
| Node floor raised | 6 | 2 | oclif/core #1627, #1396; chalk #646 |
| help text changing under tests | 2 | 4 | adjacent only |

No issue in any snapshot is about moving between commander, yargs, oclif, citty or cac. The pain
people report is the **module format and the Node floor**, the same two walls Part B measures.
The incumbents' changelogs show where those walls came from:

- **commander** raised its Node floor at roughly every yearly major: 12 needs Node 18 and 14 needs
  Node 20. 15 (2026-05-29) is ESM-only and needs Node 22.12.
- **yargs 18** (2025-05-26) went ESM-first, needs Node 20.19 and removed the singleton.
- **The output stack**: chalk, ora, boxen and meow went ESM-only in 2021.

The 61.1% of commander dependents on 13 or older are, for the most part, people who have not
taken those upgrades.

## Part C — trust and social

The full table, with sources and commands, is in [`trust.json`](./adoption-barriers/trust.json).

| | burgee | commander | yargs | chalk | ora | @oclif/core | citty | cac |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| first publish | 2026-09-07 | 2011-08-14 | 2013-11-23 | 2013-08-03 | 2016-03-03 | 2020-09-02 | 2022-04-23 | 2016-01-14 |
| downloads / week | 941 | 314.2 M | 159.4 M | 292.2 M | 55.1 M | 6.7 M | 21.4 M | 30.3 M |
| dependents (npm search) | **0** | 150,896 | 42,448 | 160,691 | 47,175 | 3,682 | 2,203 | 3,710 |
| stable releases, last 365 d | 46 (in 42 days) | 3 | 4 | 2 | 5 | 51 | 3 | 3 |
| median days between releases | **0.32** | 107.9 | 37.1 | 62.5 | 37.7 | 2.76 | 35.6 | 113.1 |
| human authors, 12 months | **1** | 15 | 13 | 2 | 5 | 15 | 10 | 7 |
| bus factor (authors covering 50% of commits) | 1 | 1 | 1 | 1 | 1 | 2 | 1 | 1 |
| SHA-pinned actions | 76 / 77 | 6 / 6 | 14 / 14 | 0 / 2 | 0 / 2 | 0 / 27 | 6 / 6 | 0 / 5 |
| trusted publishing + provenance | yes | no | yes | no | no | yes | no | yes |
| SECURITY.md | yes | yes | yes | yes | yes | no | no | no |
| types | bundled | bundled | bundled | bundled | bundled | bundled | bundled | bundled |
| license | MIT | MIT | MIT | MIT | MIT | MIT | MIT | MIT |

- **Bus factor 1 is ordinary.** It holds for 11 of the 16 incumbents measured, and commander and
  yargs each rest on one maintainer for about 46% of commits. What is unusual about burgee is the
  combination of one human author, about 27 commits per active day and an age of six weeks. 614 of
  its 847 commits (72.5%) carry a Claude co-author line.
- **burgee leads on supply-chain hygiene.** On every proxy that could be measured it is ahead of
  every incumbent here.
- **Churn is measurable, and it costs.**
  - burgee went from 1.0.0 to 1.6.0 in 8.7 days, three minors of it on 2026-10-12.
  - The family shipped 248 releases in 30 days.
  - In those 30 days burgee's `latest` was at least 7 days old on 0 days, and at least 3 days old
    on 3.9.
  - Two minors changed behaviour that the incumbent itself shipped as a major:
    - burgee 1.5.0 refuses surplus positionals with exit 2. commander made the same change in
      13.0.0, a major.
    - flagstaff 1.2.0 follows boxen 9's `#GGG` throw. boxen shipped that in 9.0.0, a major.
  - In the trial, a 7-day `minimumReleaseAge` refused `burgee@^1.6.0` outright (svgo `manual`).

## Ranked barriers

**Score = share × severity.** The share is the share of commander and yargs dependents the
barrier applies to, from the random frame unless the row says otherwise. The severity is:

- **3**: migrate cannot act, or the result breaks a build or a run;
- **2**: the adopter must ship a semver-major or change their configuration;
- **0.5**: nothing breaks, but it is a reason to wait.

"Covered" names the intent or decision that already owns the barrier. "New" names a draft intent
added by this pull request.

| # | Barrier | Share (n, 95% CI) | Sev. | Score | Evidence | Already addressed? | Proposed fix |
| --: | :-- | :-- | --: | --: | :-- | :-- | :-- |
| 1 | **The incumbent is not on the claimed major**, so migrate is a no-op, and moving by hand breaks on the incumbent's own removed APIs | 83.7% (1,860 / 2,223); 56.7% after commander 14 and yargs 17 are claimed | 3 | **2.51** (1.70 after) | Trial: 5 / 9 untouched. By hand, 4 / 5 crashed and 3 of those 4 kept a green suite | **Partly.** [`previous-majors`](../intents/previous-majors/intent.md) (approved) claims 14 and 17 only; `offMajor` in `migrate.ts` reports the gap | **New** [`migrate-older-majors`](../intents/migrate-older-majors/intent.md): migrate names every line that uses an API the claimed major removed (`require('commander')` as the program in wait-port and madge, a multi-character short flag, the yargs singleton; madge's `storeOptionsAsProperties` is the program's first use, not a removed API, per its row in the table), so an off-major project gets a work list instead of `nothing to rewrite` |
| 2 | **CommonJS-only on a Node that cannot `require(esm)`** | 32.4% (30.4–34.4), n = 2,215 | 3 | **0.97** | burgee is ESM-only. `require('burgee/commander')` is `ERR_REQUIRE_ESM` on Node 18.20 and 21.7. On 18, `roundel/chalk` and `flagstaff/ora` fail at import (`styleText`) | No. The floor is deliberate (`cli-packaging`), and migrate does not check it | **New** [`migrate-preflight`](../intents/migrate-preflight/intent.md): migrate reads `type`, `engines.node`, the test runner and `moduleResolution`, and reports the floor it raises before writing anything |
| 3 | **Adopting raises the adopter's `engines.node`**, a semver-major for them | 44.9% of all (65.2% of the 1,524 that declare it) | 2 | **0.90** | Trial: 5 / 9 below the floor; the report never says so. `npm i` only warns `EBADENGINE` | No | the same **new** `migrate-preflight` |
| 4 | **TypeScript `node10` resolution cannot see subpath types** | 25.8% of repos (38.8% of TS, n = 170) | 2 | **0.52** | Trial: TS2307 in 2 / 2 TS CommonJS projects. No family package ships `typesVersions` | No | **New** [`types-under-node10`](../intents/types-under-node10/intent.md): `typesVersions` for every drop-in subpath |
| 5 | **Trust and churn**: six weeks old, one human author, 0 outside dependents, 46 releases in 42 days, behaviour changes in minors | all (n/a) | 0.5 | **0.50** | Part C. A 7-day age refused `burgee@^1.6.0`; `latest` was ≥7 days old on 0 of 30 days | Partly. [`first-adopter`](../intents/first-adopter/intent.md) (review) owns the social proof; nothing owns cadence | **New** [`release-cadence`](../intents/release-cadence/intent.md): a change an incumbent shipped as a major ships as a major here, and releases are batched so `latest` is old enough for a 7-day gate most days |
| 6 | **Install and bundle weight** | all; 28.3% bundle | 0.5 | **0.50** | 8.2x commander installed, 1.95x bundled (2.2x gzip). `burgee/yargs` 1.10x | **Yes, by decision.** [`D-20261008-install-bytes`](../decisions/D-20261008-install-bytes.md) keeps the install bytes until a measured adopter declines (none has). [`commander-front-end-diet`](../intents/commander-front-end-diet/intent.md) owns the bundle | none new. This trial found no decline, so the reopen trigger is not met |
| 7 | **Under a release age, `next` pins a version without the drop-in** | 1 / 1 trial project with a release age; share in the population not measured | 3 | **0.33** (on 11%, 1 / 9) | svgo: `roundel@^1.0.4` lacks `./picocolors` (added 1.1.0). Typecheck 3 errors, 6 tests and 3 files failed, CLI `ERR_PACKAGE_PATH_NOT_EXPORTED` | No. [`migrate-release-age`](../intents/migrate-release-age/intent.md) (approved) forbids a lower major only | **New** [`migrate-pins-carry-the-drop-in`](../intents/migrate-pins-carry-the-drop-in/intent.md): the floor is the first version that exports the subpath |
| 8 | **jest cannot load an ESM-only drop-in from CommonJS** | 8.3% (7.2–9.5) | 3 | **0.25** | @swc/cli: one suite fails to load, `Cannot use import statement outside a module` | No | in **`migrate-preflight`**: detect jest + CommonJS and print the `transformIgnorePatterns` / `--experimental-vm-modules` line, or decline |
| 9 | **A refused file holds an incumbent** (non-literal specifier, missing type export, a dependency sharing classes) | 3 / 9 trial projects (33%); not measured in the population | 0.5 | **0.17** | postcss-cli: 4 `import(plugin)` lines hold picocolors. madge: `require(path.join(…))`. nest-cli: `TableConstructorOptions` | Partly. U12-4 holds on purpose; `cli-table3` types belong to [`output-stack-compat`](../intents/output-stack-compat/intent.md) | **New** [`migrate-dynamic-specifiers`](../intents/migrate-dynamic-specifiers/intent.md): a non-literal specifier holds nothing it cannot name |
| 10 | **@inquirer/prompts is not level yet** | 7.7% depend on `@inquirer/*` | 0.5 | **0.04** | nest-cli: 100 / 213, left alone | **Yes.** [`inquirer-prompts-drop-in`](../intents/inquirer-prompts-drop-in/intent.md) | none new |
| 11 | help-text snapshots | 1.1% (3 / 272); 5.1% popular | 2 | 0.02 | svgo: the only drift is commander 11→15's own; burgee equals 15 byte for byte | **Yes.** `commander-compat` byte identity | none |
| 12 | mocks of the incumbent | 1.5% host, 9.2% output stack | 3 | ≈ 0 | nest-cli: green | **Yes.** U12-1 | none |
| — | migrate refuses a tree `pnpm install` dirtied | 1 / 9 | 0.5 | 0.06 | @swc/cli `node-compile-cache/` | no | small: name the untracked paths in the refusal, so `--force` is an informed choice. It folds into `migrate-preflight` |
| — | cold start | — | — | 0 | real CLIs: within noise or faster | `control-band-cold-start-ratio` | none. Not a barrier |

### The order of work this implies

1. Barrier 1 dominates, with more than twice the score of anything else. `previous-majors` moves
   it from 2.51 to 1.70. `migrate-older-majors` is what touches the remaining 56.7%, and it is a
   report, not a rewrite: it names lines; it does not rewrite them.
2. Barriers 2, 3 and 8 are one piece of work. migrate already reads `package.json`; it should
   refuse, or warn, before it writes a tree that cannot load.
3. Barrier 4 is the cheapest fix in this list: one `typesVersions` block per package.
4. Barrier 7 is a defect in shipped code, and the only one of these that turns a working CLI into
   one that does not start.

## What could not be measured, and why

- **OpenSSF Scorecard scores.**
  - The Scorecard API, img.shields.io and the host holding burgee's own results file are blocked
    from this environment.
  - burgee's last three Scorecard runs on `main` succeeded.
  - SECURITY.md, pinned actions and provenance stand in for the score.
- **Live issue trackers.** The GitHub API in this session reaches only `ofri-peretz/burgee`.
  Incumbent issues come from the snapshots already in `issues/`, not a fresh query.
- **Downloads per version.** `api.npmjs.org` is blocked.
  - So the majors in Part B are counted per dependent, not per install.
  - Download weights are npm search's weekly figure.
- **A uniform sample of all dependents.** ecosyste.ms and deps.dev are blocked. The frame is the
  CLI-tagged search results, and the npm search offset cap (5,000) limits `keywords:cli` to its top
  5,250.
- **Release-age adoption.** The share of projects with a pnpm `minimumReleaseAge` or Renovate's
  `minimumReleaseAge` was not measured, because sparse clones did not fetch `pnpm-workspace.yaml`
  or `renovate.json`. Barrier 7's share is therefore the trial's 1 / 9.
- **Non-literal specifiers in the population.** Barrier 9 is measured on the trial only.
- **Which incumbent APIs dependents call.** Barrier 1's crash classes come from 4 projects. How
  often each removed API is used was not scanned.
- **yarn and Windows.** No trial project used yarn. Nothing ran on Windows or macOS.
- **Test counts for tap.** qrcode's tap output was not parsed, so its row reads pass/pass on exit
  code alone.
- **Help snapshots in the trial.** None of the 9 projects snapshot `--help`, so the trial gives no
  case of that class. The population share is 1.1%.
- **Two baseline failures.** These are environment limits, identical in both arms: wait-port's
  IPv6 tests and madge's graphviz tests.

## Reproduce

The scripts are in the scratchpad of the run, not in this repository. Each command and SHA is in
`field-trial.json`. To redo one project:

```bash
git clone https://github.com/svg/svgo && cd svgo && git checkout e4cb29be
pnpm install --frozen-lockfile
npx burgee@1.6.0 migrate --json   # read .data.next and run it as printed
pnpm typecheck && pnpm test && node bin/svgo.js --help
```

The population frame is `https://registry.npmjs.org/-/v1/search?text=keywords:cli&size=250&from=<0..5000>`,
then `https://registry.npmjs.org/<name>/latest`. `population.json` carries every row and the
`method` block.
