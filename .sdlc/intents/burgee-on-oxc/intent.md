# Intent — `burgee-on-oxc`: the oxc engine where burgee reads code, never where it parses argv

**Status:** draft · **Opened:** 2026-11-07 · **Owner:** @ofri-peretz · **Decided under:**
[`D-20261107-native-engine-thresholds`](../../decisions/D-20261107-native-engine-thresholds.md) ·
**Scope:** [`D-20261107-burgee-on-oxc-scope`](../../decisions/D-20261107-burgee-on-oxc-scope.md)

---

## What is wanted

The owner's threshold rule for native engines
([`D-20261107-native-engine-thresholds`](../../decisions/D-20261107-native-engine-thresholds.md))
is applied to each place burgee reads JavaScript or TypeScript source, and each gets a recorded
verdict. Nothing is built that the rule does not clear.

- **(a) `burgee migrate` on an oxc AST**, in place of the token scan in
  `packages/burgee/src/migrate.ts` (3,005 lines; its own header says "a scan, not a parse", and it
  refuses whatever it cannot classify). **Verdict: fails the rule today; not built.** It is kept
  only as a re-measurement on a wider corpus, and it is built only if scan-limited refusals
  appear there.
- **(b) burgee's own packages built through an oxc-based bundler or minifier** (rolldown, or
  oxc's minifier behind the current `tsc` build) instead of shipping `tsc` output file by file.
  **Verdict: outside the rule.** This is build tooling and ships nothing native to users. It stays
  as a measured experiment against the weight and cold-start bands, and it is dropped if there is
  no gain.

## The rule, applied

**(a) `migrate`, criterion by criterion** (thresholds are the rule's heuristics; the numbers are
measured):

| Criterion | Threshold | `migrate` today | Clears? |
| :-- | :-- | :-- | :-- |
| 1. Native-able share of wall time | `f` ≥ ~60% | The CPU part a Rust oxc engine replaced is 0.6–8.0 ms of a 90–135 ms command, so `f` ≈ 1–6%; projected 1.00× (ceiling 1.08×), [`D-20261028-native-engine-dropped`](../../decisions/D-20261028-native-engine-dropped.md) | no |
| 2. Worth the time | a run ≥ ~1 s, and run often | 90–135 ms, run about once per project | no |
| 3. Batch-shaped | many files per run | yes: a whole tree per run | yes |
| 4. Boundary crossed rarely | the hot loop stays native | possible: one parse per file | yes |
| 5. The hot loop is ours | yes | yes: the scan is burgee's own | yes |

It fails criteria 1 and 2. The speed case was closed by `native-engine`. The case the owner's scope
named instead is correctness: an AST could classify what the scan refuses. On today's corpus there
is nothing for it to classify: 1 refused file of 77, and that one is a missing export, not a parse
limit (below). So (a) gets no design and no code. What stays open is one measurement:
criterion 1 under Success criteria. If it finds scan-limited refusals in real projects, (a) is
reopened against the rule's ladder, cheapest rung first. That means calling an existing oxc parser
lazily (rung 2) before any core of our own, with distribution cost and the migrate drop-in parity
counted.

**(b) the build.** The rule governs runtime engine switches, and (b) is not one. A bundler or minifier
runs on this repository's machines, adds nothing to what a user installs, and leaves the argv path's
code unchanged. Its cost and benefit are both measured by the existing weight and cold-start benches,
so it is an experiment with a drop condition (criterion 3), not an engine decision.

## Why now

The owner decided the scope on 2026-11-07, after the roadmap closed at 96/96 (#1478), and the same
day adopted the threshold rule this intent is decided under. Two measurements feed the verdicts.

**Today's refusal rate is already low, and the refusal left is not a parse problem.** Measured
2026-11-07 at `31210ad60a` (main plus #1483), by calling the built `rewriteSource` on every file
`sourceFiles` admits:

| Subject (SHA) | Source files | Name an incumbent | Refused | Reason |
| :-- | --: | --: | --: | :-- |
| concurrently `3ec91b28` | 74 | 6 | 0 | |
| postcss-cli `03e8cee3` | 33 | 2 | 0 | |
| nest-cli `08d8f3c9` | 263 | 33 | 1 | `unknown-export` (`cli-table3`) |
| svgo `e4cb29be` | 120 | 4 | 0 | |
| wait-port `16083537` | 15 | 2 | 0 | |
| madge `456057b8` | 115 | 2 | 0 | |
| tsc-alias `1077308b` | 183 | 1 | 0 | |
| node-qrcode `3848ed2c` | 80 | 0 | 0 | |
| @swc/cli (`swc-project/pkgs` `2cbd4700`) | 51 | 2 | 0 | |
| docusaurus `4e6fe616` | 1,185 | 10 | 0 | |
| typeorm `5bdc6788` | 3,625 | 15 | 0 | |
| **11 subjects** | **5,744** | **77** | **1 (1.3%)** | |

The subjects are the nine field-trial projects at their trial SHAs
(`.sdlc/research/adoption-barriers-2026-10.md`) and the two monorepos `native-engine`'s `M0` measured
(`native-engine/m0/reproduce.sh`). In the October trial, 3 of 9 projects had a refused file; two of
those (postcss-cli and madge, `non-literal-specifier`) have since been resolved by
`migrate-dynamic-specifiers` without a parser. The one refusal left is `nest-cli` importing a name
`burgee/cli-table3` does not export, which is a missing export: an AST reads the same import and
refuses it the same way.

So on this corpus an AST has nothing to move. The refusal classes a scan cannot settle and an AST
can are narrower: a computed specifier that constant-folds to a literal (`const m = 'commander';
import(m)`, a template literal without substitutions), a statement mixing type and value names that
`rewriteFile` refuses because "a mixed one cannot be split by a scan", and a namespace import whose
member use decides the verdict ("`* as ns` is checked where it is used, which a scan cannot see").
`deep-import`, `require-of-default` and `sibling-state` are about the target, not the parse, and
stay refusals under any reader. Part (a) is worth reopening only if a wider corpus shows those
scan-limited classes in real projects.

**Module loading, not CPU, is what a cold start pays.** `native-engine`'s `M0` measured the argv
core's own work at 1.6 to 6.0 ms, with module loading 71 to 87% of each run, and `burgee migrate`
at a projected 1.00x from a native port (`D-20261028-native-engine-dropped`). burgee ships 108
JavaScript files today (`npm pack --dry-run` of `packages/burgee`: 276,075 bytes packed,
1,058,069 unpacked, 201 entries). Fewer, smaller modules is the only lever on that number that does
not change the argv path's code, which is what (b) tests.

## Affected users and systems

- A maintainer or an agent running `burgee migrate`: nothing changes unless (a) is reopened.
- Every consumer of `burgee` and its front-ends, if (b) lands: the published files change shape;
  the `exports` map, the subpaths and the types do not.
- `packages/burgee/src/migrate*.ts`, `cli.ts`'s dynamic import of `migrate.js`,
  `packages/oxmutate/native` (if its core is shared), each package's `build` script, and
  `weight.test.ts`'s denial of `migrate.js` from the root entry.
- Published numbers that may move: B2 cold start (`cold-start-ratio`), B4 bundled bytes
  (`core-bundled-bytes`, `commander-front-end-bundled-bytes`, `yargs-front-end-bundled-bytes`), the
  weight page (`npm run weight:page`), and A10's migrate budget (`migrate-bench.test.ts`).

## Constraints

- **The argv path does not change engine.** No native code, no WASM and no new module load on
  `import 'burgee'`, `burgee/commander`, `burgee/yargs` or `burgee --help`. See the non-goal below.
- **Zero runtime dependencies outside the burgee family (rule 2).** An oxc core reached from
  `migrate` is either oxmutate's own binding or a family package published from this repository;
  it is never a third-party `dependency` of `burgee`.
- **Lazy, and denied by a lock.** The AST is loaded only behind `migrate`'s existing dynamic
  import, and `weight.test.ts` denies it to every entry other than the migrate path, the way it
  already denies `migrate.js`.
- **Never silently (D-051).** On a platform with no prebuilt binding, `migrate` either falls back
  to today's scan and says so in its report, or refuses with the reason. It never produces a
  different rewrite without saying which reader made it.
- **Byte-identical where both readers agree.** Every file today's scan rewrites, the AST rewrites
  to the same bytes (`M0`'s `compare.mjs` method, already run once for `native-engine`).
- **The runtimes keep running.** `Runtime smoke · bun, deno` passes unchanged; a build change in
  (b) may not emit anything bun or deno cannot load.
- **The bands are not traded.** Cold start and weight stay inside their control bands; a size win
  in one package paid for by another is not a win.

## Non-goals

- **A native engine on the argv path.** Rejected by the owner on 2026-11-07, for three reasons:
  loading a native addon costs more than the argv work it would replace (`M0`: 1.6 to 6.0 ms of work,
  module loading 71 to 87% of a run); it breaks the zero-dependency floor for every consumer, not
  only for people who migrate; and it breaks the bun and deno runtime smoke, which load burgee's
  JavaScript as published. `native-engine` (dropped 2026-10-28) already measured this; nothing here
  reopens it.
- **Porting `migrate` for speed.** `native-engine` measured a projected 1.00x. Part (a) is about
  what `migrate` can classify, not how fast it reads; A10's budget only has to hold.
- **Changing what `migrate` refuses on purpose.** Deep imports, missing exports, `require` shape
  mismatches and sibling state stay refusals; an AST is not a reason to guess.

## Success criteria

1. **The verdicts are recorded (this document).** (a) fails the rule today and is not built; (b) is
   outside it and stays a measured experiment.
2. **(a) is re-measured before it is ever built.** Run the refusal measurement over the 11 subjects
   above plus a wider population of commander and yargs dependents
   (`.sdlc/research/adoption-targets.md`), and classify each refusal as scan-limited or semantic.
   Record the result here. If no scan-limited refusal appears, (a) is dropped with the numbers. If
   some do, (a) is reopened under the rule's ladder. A reopened (a) must refuse fewer files on that
   corpus, rewrite every file today's scan rewrites to identical bytes, keep A10
   (`migrate-bench.test.ts`) no slower, and move no B2 or B4 band. `burgee --help` must load the
   same module set (a lock, not a reading).
3. **(b) is a measured gain or it is dropped.** Built through the oxc toolchain, each published
   package is smaller (packed and unpacked, `npm pack --dry-run`) or loads fewer modules on a cold
   start, as the existing B2 and B4 benches and `npm run weight:page` measure, with no band
   regressing. If neither number improves, (b) is dropped and the reason is recorded here. If (b) is
   dropped and (a) stays unbuilt, this intent's status becomes `dropped`.
4. **The floor holds.** `burgee` keeps zero runtime dependencies outside the family, and
   `Runtime smoke · bun, deno` passes on anything that lands.

## Open questions

None open. The scope and the non-goal were decided with the owner on 2026-11-07
([`D-20261107-burgee-on-oxc-scope`](../../decisions/D-20261107-burgee-on-oxc-scope.md)), and so was
the rule each part is judged by
([`D-20261107-native-engine-thresholds`](../../decisions/D-20261107-native-engine-thresholds.md)).
What is not known yet is measured, not decided: whether real projects carry scan-limited refusals
(criterion 2), and which oxc-based build tool, if any, wins for (b) (criterion 3).
