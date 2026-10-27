---
id: B-20261027-migrate-pins-match-exact-convention
section: B
status: closed
source: first-adopter A3 proof on open-cli-tools/concurrently (`.sdlc/research/adoption/concurrently.md`)
recommendation: 'When every runtime dependency in the manifest is pinned to an exact version, `next` adds the drop-in at an exact version too (`pnpm add burgee@1.7.2`, not `burgee@^1.7.2`), and the report says why. Otherwise keep the caret'
---

On concurrently, `burgee migrate` printed `next: pnpm add burgee@^1.7.2 && pnpm remove yargs`,
and running it wrote `"burgee": "^1.7.2"`. Every other runtime dependency in that manifest is
exact: `chalk 5.6.2`, `rxjs 7.8.2`, `shell-quote 1.12.0`, `supports-color 10.2.2`,
`tree-kill 1.2.2`, and `yargs 18.0.0`, the one being replaced. A reviewer would ask for the pin,
so the PR shape was pinned by hand.

This is B, not A, because it changes what `next` promises. The caret came in under U12-2
(D-20261008-migrate-u12-findings) as a fix for an *unpinned* install. Matching the manifest's own
convention is a new rule about whose style wins, so it is decided before it is built.

**Closed 2026-10-27** by #1311, decided in
[D-20261027-migrate-pins-follow-exact-convention](../decisions/D-20261027-migrate-pins-follow-exact-convention.md).
The recommendation is widened by one rule. `next` pins exactly when every runtime dependency is
exact, or when every incumbent the run moves is. It keeps an incumbent's `~`, and otherwise the
caret. An exact pin carries the installer's own flag (`pnpm add --save-exact burgee@1.7.2`),
because `npm install burgee@1.7.2` alone saves `^1.7.2`. The report gains no field: the pin in
`next` is the report. `packages/burgee/src/migrate-pins.test.ts` holds the concurrently shape
and each installer; the ten cases that expect an exact or `~` pin were red on the code before.
