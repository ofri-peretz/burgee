# Design — Packaging floor

Intent: [`intent.md`](./intent.md). **Status:** shipped — R1–R6 each held by the check in § Restated 2026-10-18 (2026-10-19).

**Restated:** 2026-10-18 — see § Restated 2026-10-18

---

## Restated 2026-10-18

**R1–R3, R5 and R6 held or restated; R4 held except its forbidden-file refusals, which no test exercises — REMAINING: R4 `.map`/test/AGENTS.md negative fixture.** *Closed 2026-10-19: `forbiddenInPack` is exported and `scripts/forbidden-in-pack-lock.test.ts` is the fixture.*

| ID | promised | on main | check | disposition |
| :-- | :-- | :-- | :-- | :-- |
| R1 | no `dependencies` at all; hosts and UI as peers | same-repo family links allowed (U6); nothing external in any field (D-111) | `scripts/package-shape-lock.test.ts` › "has no external runtime dependencies, and same-repo ones only point up the family (K1, U1, U6)"; › "declares an external peer only where a spec admits it, and only as optional" | restated |
| R2 | ESM; `types` + `import` + `default`; Node floor; no `main` | yes, at D-132's floor | `scripts/package-shape-lock.test.ts` › "is ESM, requires Node ^20.19.0 \|\| >=22.13.0, and declares no legacy main (K2)", › "exposes types, import and default on every code entry, so CommonJS can require() it (K2)" | held |
| R3 | lock: no `chalk`, `picocolors`, `glob`, `node-fetch`, `minimist`; the `eslint-plugin-cli-floor` rules | the import lock; the plugin left this repo | `scripts/package-shape-lock.test.ts` › "imports none of the packages Node ships natively (K3)" | held; the plugin half dropped (moved to the eslint repo as eslint#1137 by the 2026-10-18 roadmap ruling) |
| R4 | `check-published-artifacts.ts`: exports exist, inside `files`, no `.map` / `*.test.*` / `AGENTS.md`; a `release.yml` stage | existence: `missingExportTargets`; `files`: `pack-list-lock`; forbidden files: `forbiddenInPack`, exported and tested; stage wired | `scripts/pack-list-lock.test.ts` › "ships every file its `exports` promises"; `scripts/artifact-size-ratchet-lock.test.ts` › "runs check:artifacts in quality-full.yml's build job"; forbidden files: `scripts/forbidden-in-pack-lock.test.ts` › "refuses a JavaScript source map (dist/index.js.map)", › "refuses a compiled test (dist/cli.test.js)", › "refuses agent instructions at the root (AGENTS.md)" | held (2026-10-19; red first: 9 of 16 cases fail with the refusal stubbed out) |
| R5 | artifact-size baseline, 10% ratchet | yes, both `size` and `unpackedSize` | `scripts/artifact-size-ratchet-lock.test.ts` › "catches a gzipped-tarball regression", › "catches an unpacked regression the tarball hides", › "allows growth inside the 10% allowance" | held |
| R6 | `runtime-smoke.yml`, bun and deno, advisory | yes | `.github/workflows/runtime-smoke.yml` jobs "bun runs the demos" and "deno runs the demos" | held |

- **Verification section.** `scripts/__fixtures__/` was never created: the negative cases are
  inline in each lock test. "`release.yml --dry-run` on `@interlace/cli-core`" names a package
  that does not exist; the stage runs on every `packages/*` build in `release.yml`'s build job.
  The one negative case for R4's forbidden files landed 2026-10-19, inline like the others.

## Requirements

- **R1 (K1)** `scripts/package-shape-lock.test.ts`: every non-private package has no
  `dependencies` at all (there is no internal core any more); hosts and UI libraries, if
  ever needed, are `peerDependencies`.
- **R2 (K2)** Every non-private package: `"type": "module"`, every `exports` entry has
  `types` + `import` + `default` (the `default` is what lets CommonJS `require()` the ESM
  file), `engines.node: ">=24"`, no `main`; locked. Revised 2026-09-07 from "import only"
  when the owner required CJS consumers to be supported. Revised 2026-09-23 (D-132):
  `engines.node: "^20.19.0 || >=22.13.0"`, the floors where `require(esm)` loads silently.
- **R3 (K3)** `eslint-plugin-cli-floor`'s `prefer-native-style-text` and
  `import-next/no-nodejs-modules` off (already) — plus a lock that no package imports
  `chalk`, `picocolors`, `glob`, `node-fetch`, `minimist`.
- **R4 (K4)** `scripts/check-published-artifacts.ts` (ported): after `turbo run build
  --filter='./packages/*'`, every `exports` target exists, is inside `files`, no `.map`,
  no `*.test.*`, no `AGENTS.md`; wired as a `release.yml` stage between build and
  publish.
- **R5 (K5)** `.sdlc/bands/artifact-size-baseline.json` with `npm pack --dry-run` sizes;
  `check-artifact-size` ratchets (a shrink updates the baseline in the PR; a growth
  over 10% fails without an explicit baseline bump).
- **R6** `runtime-smoke.yml`: `bun` and `deno run -A` the built burgee and commander demos
  (greet, `--json`, `--help`) on every push and PR; `continue-on-error: true`. **Landed
  2026-09-07**, pinned to `setup-bun` v2.2.0 and `setup-deno` v2.0.5 by SHA.

## Design

Port `eslint/scripts/check-published-artifacts.ts` and `check-artifact-size.ts` with
their tests; add the two lock tests; add the release stage. Nothing new is invented
here; the value is that it exists before the first publish rather than after the
first bad one.

## Verification

- Lock tests in root `npm test` with negative fixtures under `scripts/__fixtures__/`.
- `release.yml --dry-run` shows the artifact stage running on `@interlace/cli-core`.

## Rejected alternatives

- **Dual CJS/ESM output.** Doubles the artifact surface and re-creates the CJS-only
  dependency trap oclif is stuck in (#1450).
- **Node 20 floor for reach.** Costs `util.styleText` and `fs.glob`; Node 20 is EOL in
  2026 anyway.
- **tsup/rollup bundling of the packages.** `tsc` output of dependency-free ESM is
  already the smallest artifact; a bundler adds a build dependency to save nothing.

## Out of scope

- Producing single-file executables (`node --experimental-sea-config`, `bun build
  --compile`) — a docs page at most.
- Docker images.
