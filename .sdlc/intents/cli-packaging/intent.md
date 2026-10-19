# Intent — Zero dependencies, ESM, Node 24 natives, and a floor for what we ship

> Stage 1 artifact. Child of [`burgee`](../burgee/intent.md),
> constraint 2. Research §11 (runtime and packaging). Proposes K1–K5.

**Status:** shipped · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz · **Shipped:** 2026-10-19 by
`fix/types-under-node10`, verified on a branch from `main` at `4b6330bf` — S1–S4 each held by the check named in § Restated 2026-10-18; the last one, S3's deliberate `.map`, by `scripts/forbidden-in-pack-lock.test.ts`

**State assigned 2026-09-09** from repo evidence, at the owner’s direction. **Evidence:** the no-deps / ESM / no-`main` / `default`-condition locks, the artifact gate in `release.yml`, the tarball ratchet and the bun/deno smoke all in the repo.

**Restated:** 2026-10-18 — see § Restated 2026-10-18

---

## Restated 2026-10-18

**Criteria restated to the shipped packaging locks; S1, S2 and S4 held, S3's release wiring held but its `.map` negative case has no test — REMAINING: S3/R4 forbidden-file negative fixture.** *Closed 2026-10-19 by `scripts/forbidden-in-pack-lock.test.ts`; all four criteria held.*

Three things moved since 2026-09-06. The family links (`roundel`, `flagstaff`, `caique`, …)
are real `dependencies`, not peers (`cli-output-stack` U6, 2026-09-08), and nothing outside
the repository may be a dependency, peer or optional dependency (D-111). The Node floor is
`^20.19.0 || >=22.13.0`, not `>=24` (D-132, 2026-09-23); the workspace and compat-oracle stay
on 24. And `@interlace/cli-core` and the `*-agent` / `*-schema` / `*-env` packages were never
built: the published set is `burgee` and its family under `packages/*`. The success-criteria
bullets are numbered S1–S4 here in their order.

| ID | promised | on main | check | disposition |
| :-- | :-- | :-- | :-- | :-- |
| S1 | `npm ls --prod --depth=0` shows only peers | no external runtime dependency in any published package; same-repo links point up the family | `scripts/package-shape-lock.test.ts` › "has no external runtime dependencies, and same-repo ones only point up the family (K1, U1, U6)", › "installs nothing from outside this repository — dependencies, peers or optional (D-111)" | restated |
| S2 | a lock fails when `exports` names a file not built or not in `files` | both halves | `scripts/pack-list-lock.test.ts` › "reports a code entry that `files` excluded", › "ships every file its `exports` promises" | held |
| S3 | `release.yml` runs the artifact gate on `dist/` and blocks; a deliberate `.map` fixture is caught | gate wired (`release.yml` "Artifact gate (K4/K5)" step after the build, also in `quality-full.yml` and root `lint`); `forbiddenInPack` exported and driven by a negative fixture | wiring: `scripts/artifact-size-ratchet-lock.test.ts` › "runs check:artifacts in quality-full.yml's build job"; `.map`: `scripts/forbidden-in-pack-lock.test.ts` › "refuses a JavaScript source map (dist/index.js.map)" and seven siblings | held (2026-10-19) |
| S4 | Bun and Deno smoke jobs green (advisory) on the demo | `.github/workflows/runtime-smoke.yml`, jobs "bun runs the demos" and "deno runs the demos", `continue-on-error: true` | the workflow's own `test "$(bun …)" = "Hello, ada!"` assertions | held |

- **S2 (held).** The 2026-09-09 finding that nothing checked membership in `files` is no longer
  true: `scripts/pack-list-lock.test.ts` reads `npm pack --dry-run` per published package and
  fails on any promised file the tarball lacks, declarations included.
- **S3 (held, 2026-10-19).** `forbiddenInPack()` in `scripts/check-published-artifacts.ts` is
  exported, and `scripts/forbidden-in-pack-lock.test.ts` hands it a pack list with
  `dist/index.js.map`, a declaration map, four test-file extensions, `AGENTS.md` and a nested
  `CLAUDE.md`, each refused by path, plus seven near-misses (`sitemap.js`, `latest.js`,
  `testing.js`, `README.md`, …) let through. Shown red first: with `forbiddenInPack` stubbed
  to allow everything, 9 of its 16 cases failed.
- **The 2026-09-09 publish note** (ENEEDAUTH for roundel, flagstaff and caique) is a release
  operations finding, not a criterion here; it is not re-verified in this restatement.

## What is wanted

A packaging floor every package in this repo meets and a lock that enforces it:

1. **Zero runtime dependencies** in `@interlace/cli-core` and the `*-agent`,
   `*-schema`, `*-env`, `*-completions` packages; the host as a peer; `yaml` and
   no UI packages as peers either — the family's own `roundel`, `flagstaff` and `caique` are
   same-repo dependencies where used (re-decided 2026-09-08, `cli-output-stack` U6).
2. **ESM only**, `exports` map with `types`, no CJS build; ~~Node `>=24` in `engines`~~
   *(restated 2026-10-18: `^20.19.0 || >=22.13.0`, D-132; each entry carries `default` so
   CommonJS can `require()` it — spec R2)*.
3. **Node natives over packages**: `util.styleText`, `util.parseArgs` (not needed),
   `fs.glob`, `process.stdout.isTTY`, `node:test`-free (vitest), global `fetch`.
4. **Published artifact checks**: `main`/`exports` resolve inside `files`, no source
   maps, no test files, a size budget per package, `--provenance`.
5. **"Does not break" on Bun and Deno**: a smoke test that imports each package and
   runs the demo, advisory, not a gate.

## Why now

- **oclif/core #1627 (2026-07)** is the cautionary tale in one sentence: "17 runtime
  dependencies, several of which now have first-class native equivalents." Plus #1450
  (CJS-only deps they cannot update), #1396 (Node 18 floor).
- **Bundling issues are the other half of yargs' runtime cluster**: #2004, #2068,
  #2101 (browser/jest/ESM interop), #2186, #2216 (Deno). An ESM-only, dependency-free
  layer has no such surface.
- **The SARIF formatter in `eslint/` shipped with a `main` pointing at a `dist/` no
  build produced.** That is the exact bug K4 locks, and this repo has already
  scheduled its first publish.
- chalk is the top line on the npm-trends chart; `util.styleText` (Node 20.12+) makes
  it unnecessary in every package here, and `prefer-native-style-text` in
  `eslint-plugin-cli-floor` makes it unnecessary for consumers.

## Affected users and systems

- Every `packages/*`; `scripts/check-published-artifacts.ts` (ported from `eslint/`);
  `release.yml` gains the artifact gate before publish; `.github/workflows/runtime-
  smoke.yml` (bun, deno, advisory).

## Constraints

1. ~~`engines.node >= 24` is not negotiable; it is what makes zero-dep possible.~~
   *Reversed by D-132 (2026-09-23): published packages declare `^20.19.0 || >=22.13.0`
   after a scan found one post-20 API, since removed; zero-dep held without 24. Locked by
   `scripts/package-shape-lock.test.ts` › "is ESM, requires Node ^20.19.0 || >=22.13.0, and
   declares no legacy main (K2)".*
2. No dual CJS/ESM. A CJS consumer uses `import()`.
3. Size budgets are per-package numbers in `.sdlc/bands/artifact-size-baseline.json` (the
   eslint repo's pattern), ratcheted, never raised silently.

## Success criteria

- `npm ls --prod --depth=0` in every package shows only peers.
  **Restated 2026-10-18 (S1):** no dependency from outside the repository in any field
  (D-111); family links are dependencies (U6). Held by `scripts/package-shape-lock.test.ts`.
- A lock fails when `exports` names a file not produced by `npm run build` or not
  matched by `files`.
  **Held (S2)** by `scripts/pack-list-lock.test.ts` › "reports a code entry that `files`
  excluded".
- `release.yml` runs the artifact gate on the built `dist/` and blocks on failure;
  a deliberate `.map` file in a test fixture is caught.
  **Restated 2026-10-18 (S3):** the gate is wired and blocks. **Met 2026-10-19:** the
  deliberate-`.map` fixture is `scripts/forbidden-in-pack-lock.test.ts` (spec R4).
- Bun and Deno smoke jobs green (advisory) on the demo.

## Verified against `main` — 2026-09-09

Checked criterion by criterion on `61bd11b9`. **Two of four met, two half.** The status stays
`review`.

- **`npm ls --prod --depth=0` shows only peers** — met in substance. burgee, roundel and caique
  each have zero production dependencies; flagstaff depends on `roundel` alone; the private
  `compat-oracle` peers on the incumbents. There is no external runtime dependency anywhere. The
  criterion's word "peers" predates the 2026-09-08 U6 decision that made the family links real
  dependencies rather than peers.
- **A lock fails when `exports` names a file the build does not produce or `files` does not
  match** — half. `missingExportTargets()` catches an exports target that is absent from disk;
  **nothing checks membership in `files`**, so an entry excluded by the pack list would ship
  broken and pass.
- **`release.yml` runs the artifact gate on the built `dist/` and blocks; a deliberate `.map` in
  a fixture is caught** — half, and the untested half is the interesting one. The wiring is real
  (`release.yml:103`, publish `needs: [detect, build]`, `npm publish --provenance`), and the gate
  passes locally. But **`scripts/check-published-artifacts.ts` has no test** — it is not among the
  ten root test files — so the `.map` catch is an unproven regex. The deliberate-fixture half of
  the criterion has never been run.
- **Bun and Deno smoke jobs green (advisory)** — **met.** `runtime-smoke.yml`, both jobs
  `continue-on-error: true`, latest run on `main` successful.

**The publish path is broken, and it is not a packaging bug.** The most recent `release.yml` run
(`34309347964`) failed: the roundel, flagstaff and caique publish jobs each died with
`npm error code ENEEDAUTH … need auth`. That is why npm still shows those three at 0.0.1 against
0.1.0 in the tree. `burgee` publishes because it alone has a trusted publisher configured. Until
that is fixed, K6 provenance is proven for exactly one of four packages.

## Open questions

Decided — none open. The items below were settled when this intent was written and are
kept as the record they always were (confirmed 2026-09-20, D-072).

None open. Decided at finalisation (2026-09-06):

- Decided: **Floor additions K1–K5 are adopted.**
- Decided: **Single-file bundling is a docs page** (`esbuild --bundle --format=esm` on a zero-dep
  ESM package works by construction); no `examples/bundled/` check.
