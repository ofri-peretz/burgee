---
id: D-20261025-next-16-4-1-security
subject: 'next 16.3.8 carries two unauthenticated RCEs, fixed only in 16.4.1, whose Turbopack build is OOM-killed: how do the docs apps move?'
taken: 'Taken — next 16.4.1, built with webpack; by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-25'
date: '2026-10-25'
superseded_by: —
---

**next moves to 16.4.1 in every docs app, and the docs apps build with `next build --webpack`.**
The ten apps under `apps/docs*` are deployed live by `deploy-docs.yml`. On 16.3.8 they carry
GHSA-2464-fhr4-w9xw (unauthenticated RCE in Image Optimization with SVG), GHSA-673q-mjm6-r5xr
(unauthenticated RCE in `use cache` functions returning typed arrays) and GHSA-p3m5-59mp-jv5r
(DoS via Server Actions). The 16 line fixes all three only in 16.4.1. `npm run check:osv` on
`main`'s lockfile lists all three against `next@16.3.8`. On this change's lockfile it lists none.

**Why not Turbopack.** Every 16.4 release's Turbopack production build has been killed on these
apps (#1088, #1148, #1181, #1210). Reproduced here on `apps/docs-roundel` with a clean `.next`.
The `next-build` process itself, not its loader pool, passed 10.8 GB within 13 s and was killed.
The flags tried, none of which helped:

| next | build | wall | peak tree RSS | result |
| :-- | :-- | --: | --: | :-- |
| 16.3.8 | Turbopack | 9.2 s | 5.62 GB | built |
| 16.4.1 | Turbopack | 72 s | > 8 GB sampled | SIGKILL |
| 16.4.1 | Turbopack, `turbopackPluginRuntimeStrategy: 'workerThreads'` | 14.5 s | 16.55 GB | killed at a 16 GB cap |
| 16.4.1 | Turbopack, `turbopackFileSystemCacheForBuild: false` | 13.8 s | 17.37 GB | killed at a 16 GB cap |
| 16.4.1 | Turbopack, scope hoisting, shared runtime, side-effect inference, module fragments, cross-module constants, unused imports/exports, mangling and the CJS passes all off, no FS cache | 12.9 s | 12.14 GB | killed at a 12 GB cap |
| 16.4.1 | Turbopack, no minify, no input source maps | 14.7 s | 15.95 GB | killed at a 12 GB cap |
| 16.4.3 | Turbopack | 13.8 s | 12.97 GB | killed at a 12 GB cap |
| **16.4.1** | **webpack** | **20.3 s** | **2.92 GB** | **built, 68 pages** |

All ten apps through `turbo run build --filter='./apps/*' --concurrency=4 --force`, the cap CI's
Build lane uses, on this machine (14 cores, 48 GB), clean `.next`:

| next | build | wall | peak tree RSS |
| :-- | :-- | --: | --: |
| 16.3.8 | Turbopack (main) | 68.0 s | 21.43 GB |
| 16.4.1 | webpack (this change) | 59.5 s | 12.14 GB |

The tree RSS is the sum over every process, prerender workers included, sampled every 0.5 s.
Local load average was 45–260 throughout, so the times are an upper bound.

**What the switch costs.** webpack treats the `fumadocs-mdx:` prefix of
`fumadocs-mdx:collections/server` as a URI scheme and fails (`UnhandledSchemeError`). Turbopack
resolved the prefix through each app's tsconfig `paths`. `docsNextConfig()` in
`apps/docs-chassis/src/next-config.mjs` adds a `NormalModuleReplacementPlugin` that rewrites the
request to the generated `.source/` file, which the `paths` entry already names. One place, every
app. `next dev` still uses Turbopack: no CI job or deploy runs it.

**Alternatives rejected.**

- *Stay on 16.3.8 and waive.* Two unauthenticated RCEs on a deployed site, with a fixed release
  available. A waiver is for an advisory with no fix (`osv-scanner.toml`'s own rule).
- *15.5.28.* It also carries the fixes, but it is a major downgrade of ten apps and of fumadocs'
  peer range, for no gain over the webpack switch.
- *Turbopack with a memory limit, lower concurrency or a bigger heap.* The growth is in the native
  `next-build` process, beyond V8's heap, and a single app alone passes 12 GB. Neither
  `--max-old-space-size` nor turbo concurrency reaches it.
- *16.4.3.* Killed the same way.

**dependabot.** The `next >=16.4.0 <16.5.0` ignore (D-20261020-dependabot-ignore-ranges) is
removed. It existed because a 16.4 bump could not build, and with webpack it can. A later 16.4
patch is proposed and graded by the same Build lane. **Revisit** when a 16.4 or 16.5 release
builds these apps with Turbopack under 6 GB: remove `--webpack` from the ten `build` scripts and
the replacement plugin from the chassis.

**Follow-up, the same day: the front door's deploy.** The nine package hosts deployed from the
merge (`b3dbf60c`). The front door (`docs`) failed in `vercel build`, after `next build` had
passed, with `EISDIR: illegal operation on a directory, read`. webpack's file tracer read the
build-time `readdirSync` of `packages/` in `docs-chassis/packages` (the `llms.txt` package map)
as "every file under `packages/` is needed at run time". That was 3,871 traced files, and
`packages/compat-oracle/vendor/find-up/fixture`, a directory, was among them. Turbopack's tracer
had not done this. Every route is prerendered, so `docsNextConfig()` sets
`outputFileTracingExcludes: { '*': ['../../packages/**'] }`. Reproduced and verified with
`vercel build --prod` locally (exit 1 before, exit 0 after). `docsSiteSuite` gained "traces no
file under the repository's packages/", which fails on the unfixed config with 3,871 paths.
