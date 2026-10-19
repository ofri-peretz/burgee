---
id: D-20261019-revendor-execa-dotenv-lilconfig
subject: 'execa 10.2.0 (#1102, #1107), dotenv 18.0.8 (#1105) and lilconfig 3.1.4 (#1106) were released: what did the oracle and the drop-ins need to follow them?'
taken: Taken
date: '2026-10-19'
superseded_by: —
---

**All three re-vendored at the release tag, each control level with its reference, and no grade fell.** Measured on darwin arm64, Node 24.12.0, with `npm run compat -- --vendor <host>`, then `--control`, then the target.

| Host | Release | Commit | Control | Target | Before |
| :-- | :-- | :-- | --: | --: | --: |
| execa | 10.1.0 -> 10.2.0 | `a605753a` | 1360 / 1360 | `bellpull` 0 / 1360 (ceiling) | 0 / 1179 |
| dotenv | 18.0.7 -> 18.0.8 | `e2fe95e8` | 193 / 193 | `seniority/dotenv` 193 / 193 | 191 / 191 |
| lilconfig | 3.1.3 -> 3.1.4 | `1e77559c` | 77 / 77 | `seniority/lilconfig` 77 / 77 | 77 / 77 |

**execa.** 10.1.1 (#1102) is superseded by 10.2.0 (#1107), so one re-vendor closes both. The upstream check named 176 titles added and none removed; over the graded `arguments/`, `methods/` and `return/` the reference moves 1179 -> 1360. The one new platform branch in the graded slice (`arguments/escape.js`) chooses an expected string on Windows and registers no case, so the reference is the same on every machine. The row stays a declared ceiling (D-160): every graded file still fails at link time on `execa`, which `bellpull` does not export. `suiteDeps` moved only its `execa` pin — 10.2.0's new devDependencies (`nz`, `@typescript/native`) are not imported by any vendored test. The root `execa` devDependency moves `^10.1.0` -> `^10.2.0`, because `bellpull/capabilities.json` cites `node_modules/execa/…` and `capabilities-lock` requires the installed incumbent to be the graded release.

**dotenv.** 18.0.8 changed two things. `parseFast` now runs the regex parser's `m`-flagged unquote over an unquoted value that holds a U+2028 or U+2029 (motdotla/dotenv#1073), which closes the one disagreement between dotenv's two parsers that `dotenv-scan.test.ts` used to pin. And `DotenvPopulateOutput` is `string | undefined` (motdotla/dotenv#1074), since `populate` copies an `undefined` input as given. The re-vendor read `seniority` **192 / 193** until the scanner change was ported; it now reads **193 / 193**. `populate` already kept an `undefined` value as an own key; its signature now takes and returns dotenv's own `DotenvPopulateInput` / `DotenvPopulateOutput`. Both have unit cases in `packages/seniority` that failed on the unfixed source first.

**The bytes stay under the ceiling, not raised.** The first port of #1073 wrote the strip a second time in the scanner and took `seniority/dotenv`'s bundle to **6,012 B** against its 6,000 B ceiling (`npm run bench -- --axis weight`). The ceiling was left alone. The regex parser and the scanner now call one `unquoteLines` helper in `dotenv-scan.ts`, and the boundary test is a single character class. That brings the bundle to **5,971 B**, 29 B under the 6,000 B it weighed before 18.0.8, with no behaviour change: the same 193 / 193, and every `dotenv-scan.test.ts` case. dotenv itself bundles 11,481 B, ratio 0.52.

**lilconfig.** 3.1.4's one behaviour change is that its JSON loader drops a leading byte-order mark. Its cases are in `old-node-tests.uvu.js`, which the row's `*.spec.js` glob does not grade, so the count does not move. `seniority/lilconfig`'s `jsonLoader` read a BOM-prefixed rc file or async `package.json` as invalid JSON; it now strips one leading BOM as lilconfig does, and upstream's fourteen cases are restated in `lilconfig.test.ts` (nine failed on the unfixed source; the five on the sync `.json` path already passed, because `require` strips the mark). `suiteDeps`' `typescript` moves 5.3.3 -> 5.9.3 with upstream's range.

**Left as it is.** `benchmarks/package.json` still pins `dotenv` 18.0.7 and `lilconfig` 3.1.3 for the B4 weight pairs. Moving them re-weighs `foundation-ceilings.json`'s incumbent bytes and is the weight axis's own re-convergence, not this re-vendor's; the drift is a patch release on each side.

**For the owner.** `seniority`'s changeset is a `patch`: the fast parser's output changes only for a value holding a Unicode line separator, the populate types widen to dotenv's, and a BOM-prefixed JSON config now loads instead of throwing. Each is the incumbent's own behaviour at a patch release, and the drop-in follows its incumbent's current release (D-170).
