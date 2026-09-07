# Design — Packaging floor

Intent: [`intent.md`](./intent.md). **Status:** review.

---

## Requirements

- **R1 (K1)** `scripts/package-shape-lock.test.ts`: every non-private package has no
  `dependencies` at all (there is no internal core any more); hosts and UI libraries, if
  ever needed, are `peerDependencies`.
- **R2 (K2)** Every non-private package: `"type": "module"`, every `exports` entry has
  `types` + `import` + `default` (the `default` is what lets CommonJS `require()` the ESM
  file), `engines.node: ">=24"`, no `main`; locked. Revised 2026-09-07 from "import only"
  when the owner required CJS consumers to be supported.
- **R3 (K3)** `eslint-plugin-cli-floor`'s `prefer-native-style-text` and
  `import-next/no-nodejs-modules` off (already) — plus a lock that no package imports
  `chalk`, `picocolors`, `glob`, `node-fetch`, `minimist`.
- **R4 (K4)** `scripts/check-published-artifacts.ts` (ported): after `turbo run build
  --filter='./packages/*'`, every `exports` target exists, is inside `files`, no `.map`,
  no `*.test.*`, no `AGENTS.md`; wired as a `release.yml` stage between build and
  publish.
- **R5 (K5)** `.agent/artifact-size-baseline.json` with `npm pack --dry-run` sizes;
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
