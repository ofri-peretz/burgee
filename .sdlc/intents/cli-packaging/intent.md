# Intent — Zero dependencies, ESM, Node 24 natives, and a floor for what we ship

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md),
> constraint 2. Research §11 (runtime and packaging). Proposes K1–K5.

**Status:** shipped · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz

**State assigned 2026-09-09** from repo evidence, at the owner’s direction. **Evidence:** the no-deps / ESM / no-`main` / `default`-condition locks, the artifact gate in `release.yml`, the tarball ratchet and the bun/deno smoke all in the repo.

---

## What is wanted

A packaging floor every package in this repo meets and a lock that enforces it:

1. **Zero runtime dependencies** in `@interlace/cli-core` and the `*-agent`,
   `*-schema`, `*-env`, `*-completions` packages; the host as a peer; `yaml` and
   no UI packages as peers either — the family's own `roundel`, `flagstaff` and `caique` are
   same-repo dependencies where used (re-decided 2026-09-08, `cli-output-stack` U6).
2. **ESM only**, `exports` map with `types`, no CJS build; Node `>=24` in `engines`.
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

1. `engines.node >= 24` is not negotiable; it is what makes zero-dep possible.
2. No dual CJS/ESM. A CJS consumer uses `import()`.
3. Size budgets are per-package numbers in `.sdlc/bands/artifact-size-baseline.json` (the
   eslint repo's pattern), ratcheted, never raised silently.

## Success criteria

- `npm ls --prod --depth=0` in every package shows only peers.
- A lock fails when `exports` names a file not produced by `npm run build` or not
  matched by `files`.
- `release.yml` runs the artifact gate on the built `dist/` and blocks on failure;
  a deliberate `.map` file in a test fixture is caught.
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

None open. Decided at finalisation (2026-09-06):

- **Floor additions K1–K5 are adopted.**
- **Single-file bundling is a docs page** (`esbuild --bundle --format=esm` on a zero-dep
  ESM package works by construction); no `examples/bundled/` check.
