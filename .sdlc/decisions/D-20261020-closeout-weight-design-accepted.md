---
id: D-20261020-closeout-weight-design-accepted
subject: 'closeout-at-incumbent-weight: is the Stage 2 design accepted for Build, and is it worth building?'
taken: 'Accepted, as re-grounded — by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-20'
date: '2026-10-20'
superseded_by: —
---

**Accepted, as re-grounded on `main` at `a7d8fb7386`. The intent moves `review → approved`, and
[`spec.md`](../intents/closeout-at-incumbent-weight/spec.md) § Re-grounded is the design Build
implements.** The owner delegated Design→Build accepts on 2026-10-12, and the agent that builds
the change does not approve it.

**Worth building.** `signal-exit` is 198.9 M downloads a week and `exit-hook` 8.8 M
(`replacement-map.md`). Both B4 rows read the same on `main` today as on 2026-10-12: 4,819 B
against 1,645 B (2.929) and 3,634 B against 2,856 B (1.272). D-20261012-closeout-drop-ins-held-to-u5
already decided each drop-in is held to U5 on its own. An esbuild metafile showed where the
bytes go: `closeout/exit-hook`'s bundle is 1,746 B of its own code, 1,718 B of `registry.js`,
876 B of `deadline.js`, 339 B of `report.js` and 108 B of `ambient.js`. `closeout/signal-exit`'s
module code is 2,823 B. The other ~770 B are the CommonJS interop esbuild adds when it bundles a
`.cjs` file and its `require()` of an ES module. Two prototypes built before this decision read
1,588 B and 2,591 B. The change is a size gain on two drop-ins with 207 M weekly downloads
between them, with no new API and no new dependency, so it is built.

**What changed from the spec as written.**

1. **No shared lean core, and no shared hook list.** The spec planned one `lean.ts` holding
   hooks for both drop-ins and the registry on `ambient.ts`'s instance. On `main`, `ambient.ts`
   has no instance, only `ambientProcess()`. The two drop-ins' contracts also differ at the root.
   signal-exit re-raises the signal, wraps `emit`/`reallyExit` and shares its emitter under
   signal-exit's own global key. exit-hook calls `process.exit(128 + n)` after a `max(wait)`
   bound. One core serving both would carry both behaviours into each bundle and miss U5 for
   either. So each drop-in is self-contained:
   - `closeout/exit-hook` runs exit-hook's own machine: one `called` flag, sync hooks, then
     async hooks only on a path that can await, under a `max(wait)` timer. It imports
     `ambient.js` and nothing else.
   - `closeout/signal-exit` keeps its machine, moved to `signal-exit-core.ts`. It gets two doors:
     `require` → the CommonJS `.cjs` the suite re-evaluates, and `import` → a new ES file over the
     same core. signal-exit ships the same pair (`dist/cjs`, `dist/mjs`), and its suite grades
     its CommonJS build while B4 bundles its ES one, so the two sides are measured the same way.
2. **R4 restated.** "Mixing doors runs each handler once" holds because each door has its own
   once-guard and each handler is registered through exactly one door. It is checked by a
   mixed-door case in `process-wide.test.ts` (closeout, `closeout/exit-hook` and
   `closeout/signal-exit` on one process). The two signal-exit doors share signal-exit's
   emitter, checked by real children in `signal-exit-doors.test.ts`. `lean.qnt` models the door
   whose exactly-once used to come from the registry, `closeout/exit-hook`. The registry's own
   model, `registry.qnt`, is unchanged.
3. **R1 restated.** The attribution is a one-time measurement (the metafile table in `spec.md`)
   that directs the cut. It is not a standing test. The standing locks are the B4 gates
   (`RATIO_CEILING` 1, `BUNDLED_CEILING` at the measurement) and closeout's own `weight.test.ts`,
   which now denies `registry.js`, `deadline.js`, `report.js` and `install.js` to `./exit-hook`
   and every `.cjs` to the `import` door of `./signal-exit`.

**What the drop-in gives up, on purpose.** The registry gave `closeout/exit-hook` three extras
exit-hook never had. A deadline report printed to stderr, the `restore` phase ordered after
every hook, and a hook that throws being caught. The decision of 2026-10-12 put the phases, the
deadline and the report on `closeout`'s own entry, so the drop-in now behaves as exit-hook does.
It prints nothing at `max(wait)`, runs no ordering against closeout's own handlers, and lets a
throwing hook's rejection go unhandled. The docs say so (`coming-from/exit-hook.mdx`,
`drop-ins.mdx`).

**Semver: patch.** No export is added or removed, and no type changes. The new `import` condition
resolves to the same four names. The behaviour that changes moves the drop-in onto its
incumbent's contract, the one its 21 / 21 grade is measured against.

**Alternatives rejected:** accept the ratio as product (D-20261012 refused it); minify harder or
change B4's flags for one package (games the shared method); drop exit-hook's async wait (graded
behaviour); a single lean core for both drop-ins (heavier than either incumbent, see 1).
