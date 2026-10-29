---
id: D-20261028-oxmutate-sc6-family-deps-bundled-cores
subject: 'oxmutate SC6: is "no runtime dependency beyond the platform binary" met by what 1.0 ships — two family dependencies and six cores bundled in the tarball?'
taken: 'Restated, not waived — by the session that built oxmutate, under the owner''s standing delegation of two-way doors, 2026-10-29'
date: '2026-10-28'
superseded_by: —
---

**SC6 is restated to what its reason asks for, and 1.0.1 meets the restatement:** `oxmutate`
installs nothing from outside this repository, its family dependencies are caret ranges, and its
native code is the six cores inside its own tarball.

**What SC6 said and what shipped.** SC6 reads "`npm ls --omit=dev` lists no runtime dependency
beyond the platform binary", and spec.md planned the binary as one package per platform under
`optionalDependencies`. 1.0 ships differently on both counts:

- **Two runtime dependencies, both family packages:** `burgee` (the CLI projection: `--json`,
  `--schema`, `--mcp`, exit codes) and `bellpull` (process spawning with Windows `.cmd`
  resolution). 1.0.0 published them as `"*"`; 1.0.1 pins `^1.9.2` and `^1.0.10`
  (ofri-peretz/burgee#1350), and `scripts/package-shape-lock.test.ts` now refuses any published
  dependency that is not `^x.y.z`.
- **Cores bundled, not split out:** `binding/oxmutate.<platform>.node` for darwin-arm64,
  darwin-x64, linux-x64-gnu, linux-arm64-gnu, linux-x64-musl and win32-x64-msvc, in the one
  tarball (release run 40740297440, publish job re-run green 2026-10-29).

**Why restate rather than change the code.** SC6's reason is the ecosystem's rule 2: one supply
chain to audit. Both dependencies are published from this repository with provenance, through the
same `release.yml`, and `package-shape-lock` already holds every published package to "installs
nothing from outside this repository" (D-111). Copying `burgee`'s projection and `bellpull`'s
spawn into oxmutate would duplicate audited code to satisfy the letter of SC6. Splitting the cores
into six `optionalDependencies` packages would add six npm packages, each needing its own trusted
publisher before its first release (the entry oxmutate itself lacked, which held 1.0.0 for a day).
The cost is size, and it is the trade this records: every install downloads all six cores
(8.1 MB unpacked, 1.0.0) where per-platform packages would download one.

**SC6, as it now reads:** `npm view oxmutate dependencies` lists only packages published from
ofri-peretz/burgee, each by a caret range; `npm view oxmutate optionalDependencies` is empty; and
`npm pack oxmutate --dry-run` lists six `binding/oxmutate.*.node`.

**Reversible.** Splitting the cores out later is a minor release: the loader (`src/native.ts`)
already falls back to `oxmutate-<platform>` when the bundled core is absent.
