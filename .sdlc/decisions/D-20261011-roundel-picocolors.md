---
id: D-20261011-roundel-picocolors
subject: 'Can `roundel/picocolors` meet picocolors'' bytes, and what grades it?'
taken: Taken
date: '2026-10-11'
superseded_by: —
---

**Yes. `roundel/picocolors` bundles 1,607 B against picocolors 1.1.1's 2,739 B, so it passes R7's kill criterion, and picocolors' own test grades it 1 / 1, level with picocolors itself** (`graded-override-targets` R7). Measured on darwin arm64, Node 24.13.0.

- **The bar.** It is the "Everything" column of `/docs/weight`, measured on picocolors the same way: `export *` plus its default, through esbuild with minification. `scripts/subpath-weight-lock.test.ts` holds it there. Set below 1,607, the lock reads `bundles 1607 B, over the incumbent's 1500 B`. On disk, `./picocolors` reaches 2,646 B with `runtime.js`, against picocolors' one 2,663 B file, and `roundel/src/weight.test.ts` budgets it.
- **What grades it.** picocolors' `npm test` is `node tests/test.js` and nothing else. That file is a script of bare assertions that throws at the first failure, so the oracle grades it by exit code, as it does rc. It needs `CI` set, as upstream's runs have, because it asserts coloured bytes from the default instance. Before the façade existed, the target run read 0 / 1.
- **What does not grade it.** `tests/environments.js` evaluates picocolors' *source text* in a `vm` with a fake `process`, and upstream does not run it. No implementation that imports anything could pass it. Its nine environments, plus a TTY with and without `TERM=dumb`, are held by `roundel/src/picocolors.test.ts` instead. That test evaluates picocolors' own installed source the same way, runs this façade under the same fake process, and requires the same `isColorSupported` and the same bytes.
- **The forty-one styles are not exported by name.** picocolors' `export =` types let TypeScript import `red` by name. Node's ES loader does not: `import { red } from 'picocolors'` throws `Named export 'red' not found` against picocolors itself. Exporting them by name took the façade from 1,607 B to **2,845 B, over the bar**, so they are not exported. `drop-in-type-surface-lock` names each one in `GAPS` with that reason. A CommonJS `require` gets them from the default object, as it does from picocolors.
- **Not over `roundel/tokens` and `roundel/policy`, as the spec words it.** A token closes and re-opens around every line break. `roundel/policy` honours `FORCE_COLOR=0`. picocolors does neither, and its test asserts exact bytes. The façade therefore carries picocolors' own formatter and detection. It reads the process through `runtime.ts`, roundel's one door to it, and reads the platform from `node:os`. `runtime.ts` cannot grow: `./chalk` reaches it, and at 9,414 B with a `platform` read added, the chalk graph went over its own 9,370 B bar. `./picocolors` reaches nothing else in roundel.

**For the owner.** This adds a public entry point to `roundel`, so it needs a `roundel` minor changeset. None is written, because of the outside adopter's minimum release age: no roundel changeset before 2026-10-13 04:00 UTC. The PR is held as a draft until then. Merging it without a roundel release would let a published `burgee migrate` rewrite `picocolors` to a subpath the published roundel does not have.
