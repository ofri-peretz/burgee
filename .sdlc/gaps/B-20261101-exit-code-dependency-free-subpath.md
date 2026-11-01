---
id: B-20261101-exit-code-dependency-free-subpath
section: B
status: open
source: first-adopter A4, oxmutate adoption report friction 2 (`.sdlc/research/adoption/oxmutate.md`)
recommendation: 'Publish `burgee/exit-code`, a subpath that exports `ExitCode` and `isExitCode` and imports nothing else, with a cold-start fixture that loads it and asserts the module count (as `benchmarks/cold-start-modules.test.ts` does for the root), proven red on `burgee@1.9.4` first, where the only way to get `ExitCode` is the root entry'
---

`ExitCode` is exported only from the root entry (`packages/burgee/src/index.ts` re-exports it from
`./exit-code.js`; no subpath in `package.json` `exports` carries it). oxmutate's `src/child.ts`, the
warm Vitest server it spawns once per worker and again after every watchdog kill, imports `burgee`
for `ExitCode.OK` and nothing else.

The adoption report measures that import at 121–139 ms (three cold imports, Node 24.12, an
Apple-silicon laptop under load, 2026-11-01), and counts 1,142 servers re-spawned after a watchdog
kill on one caique run on 2026-10-31. A `0` literal would remove the cost, but burgee's E1 says no
other literal may reach `process.exitCode`, so an adopter that follows the rule pays for it.

Related, not the same: [A-20261009-burgee-cold-start](./A-20261009-burgee-cold-start.md) is the root
entry's own start-up regression. This gap is about not loading the root entry at all when only the
code table is wanted. It is B because it adds a published subpath. It is also a cost for the
`oxmutate` intent's SC8.
