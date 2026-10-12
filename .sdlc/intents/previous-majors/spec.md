# Design — Commander 14 and yargs 17 are claimed

Intent: [`intent.md`](./intent.md). **Status:** approved.

**Accepted by the owner, 2026-10-12, by instruction: create and execute.** The instruction and the
evidence are recorded in [`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md).

---

## Requirements

- **R1 — `burgee/commander/v14`.** A subpath that exports the commander façade with one
  behaviour switched to 14's: the excess-arguments message omits the surplus argument, as
  commander 14.0.x prints it. Nothing else differs.
- **R2 — Commander 14 claimed.** `compat-oracle`'s `commander-14` row grades the new subpath
  at 1,331 / 1,331. `SUPPORTED_MAJORS.commander` becomes `[14, 15]`, and the compatibility page
  regenerates.
- **R3 — `burgee/yargs/v17`, ESM half.** A subpath exporting the yargs façade with 17's
  surface wherever 18 changed it, starting from the cases the yargs-17 baseline fails outside
  the singleton files.
- **R4 — `burgee/yargs/v17`, CommonJS singleton.** `require('burgee/yargs/v17')` returns an
  instance bound to `process.argv.slice(2)` that is also callable as the factory, as yargs 17's
  `index.cjs` does. The ESM import keeps 17's factory shape.
- **R5 — Yargs 17 claimed.** The `yargs-17` row grades level with its control.
  `SUPPORTED_MAJORS.yargs` becomes `[17, 18]`.
- **R6 — `migrate` writes the versioned subpath.** A project whose `package.json` range
  resolves to a claimed older major is rewritten to that major's subpath. The off-major refusal
  stays for majors still unclaimed.

## Design

Each versioned subpath is a thin module over the current façade. It passes a `major` option
into the one place each behaviour differs. Commander has a single switch (R1). Yargs has a short
list (R3), which R3's PR states from the baseline's failing case names. The singleton (R4) is a
CommonJS entry, `dist/yargs/v17.cjs`, built the way the façade's existing `require` entry is
built: it creates one instance at load and attaches the factory to it.

Order: R1 and R2 first, as one small PR, since this is the cheapest claim in the table. R6 can
follow at once for commander. Then R3, R4 and R5 in the compat-oracle lane, after wave 2's
graded hosts have cleared it.

## Verification

| R | Check | Shown failing first by |
| :-- | :-- | :-- |
| R1, R2 | `npm run compat -- commander-14` reads 1,331 / 1,331; `scripts/supported-majors-lock.test.ts` | today 1,329 / 1,331, and the lock rejects a `[14, 15]` claim below its control |
| R3 | `npm run compat -- yargs-17`, the count outside the four singleton files | today's baseline, 191 / 794 |
| R4 | the same run, the four singleton files; `packages/burgee/src/yargs/v17-require.test.ts` (new) | written first: `require()` returns a factory, and `.argv` is undefined |
| R5 | the lock with `[17, 18]` | the lock fails until the grade is level |
| R6 | `packages/burgee/src/migrate.test.ts`: the two pinned fixtures | today both are refused as off-major |
| all | `npm run compat -- commander yargs` | unchanged current-major grades are the evidence nothing leaked |

## Rejected alternatives

- **Read the installed incumbent's version at runtime and switch behaviour.** After migration
  the incumbent is not installed. A drop-in that changes behaviour based on an absent package's
  version is a trap.
- **Claim 14 and 17 with the gaps footnoted.** D-145 rejected this. `migrate` would rewrite a
  program onto behaviour it does not expect.
- **Ask adopters to upgrade to 15 or 18 first.** That is the migration cost the drop-in exists
  to remove, and it is the reason the first adoption target is still on 17.

## Out of scope

- Commander 13 and older, and yargs 16 and older. No grade exists. A major enters this list
  only once its suite is vendored as a `PREVIOUS_MAJORS` row.
- dotenv 17 (107 / 141) and ink 6 (540 / 584). Each belongs to its own package's lane.
- Types for the older majors. `extra-typings-drop-in` (wave 2) owns the `tsd` runner.
