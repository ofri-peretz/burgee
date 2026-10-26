# Design — Commander 14 and yargs 17 are claimed

Intent: [`intent.md`](./intent.md). **Status:** shipped (2026-10-19), released 2026-10-25 in burgee 1.7.0 (Version PR #1231).

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

## Status

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** 2026-10-12 | `burgee/src/commander/v14.ts`, `burgee/package.json` | `npm run compat -- commander-14` against `burgee/commander/v14`: 1331 / 1331, control 1331 / 1331. Red first on `burgee/commander`: 1329 / 1331, the two `.exitOverride` excess-argument cases. The switch is a subclass in its own entry, so `command.ts` is untouched and a 15 program bundles none of it (D-20261012-commander-14-budget) |
| R2 | **Built** 2026-10-12 | `burgee/src/compat.ts`, `compat-oracle/src/hosts.ts`, `baseline/majors/commander-14.json` | `scripts/supported-majors-lock.test.ts` with `commander: [14, 15]`. Red first: `commander 14 is claimed below level: 1329 against a control of 1331`, and the row's target was held to `burgee/commander`. The lock now admits the front-end or its `/v<major>` entry |
| R3 | **Built** 2026-10-19 | `burgee/src/yargs/v17.ts`, `yargs/v17-factory.ts`, `yargs/v17-yargs.ts`; `burgee/package.json` (`./yargs/v17`, `./yargs/v17/yargs`) | `npm run compat -- yargs-17` against `burgee/yargs/v17`: **793 / 794, control 793 / 794**. Red first: 191 / 794 against `burgee/yargs`, and 775 / 794 with the singleton alone. The 18 cases left were three 17 behaviours, named from the failing case names: the string table (18's constructor sets `en_US` on every instance; 17's leaves it, and makes a fresh table per load — 14 cases), `commandDir()` (17's `require-directory` walk: depth first, `include`/`exclude` against the path, `visit` handed the module itself — 2), and a command module with no `command` named after its file through `require.cache` (1). `src/yargs/v17.test.ts` pins each beside 18's answer from `burgee/yargs`. `burgee/yargs` gains only an optional `CommandInstance` on its platform shim and still grades 816 / 816. **Beyond the design:** 17 has two CommonJS entries, `yargs` (the singleton) and `yargs/yargs` (the factory with `applyExtends`, `hideBin`, `Parser`, and nothing else — `helpers.cjs` counts its keys), so the second is its own subpath, `burgee/yargs/v17/yargs` |
| R4 | **Built** 2026-10-19 | `burgee/src/yargs/v17.cts` → `dist/yargs/v17.cjs`, the `require` condition of `./yargs/v17` | `packages/burgee/src/yargs/v17-require.test.ts`, six cases in a child process each. Red first against main's exports map: five of six fail, `ERR_PACKAGE_PATH_NOT_EXPORTED`; the sixth pins `require('burgee/yargs')`'s factory, whose `.argv` is undefined. CommonJS, as the design said, and the suite is why: it busts the require cache in every `beforeEach` and requires the entry again over a new `process.argv`, and an ES module is evaluated once per process whatever the cache says — the ESM singleton tried first read 772 / 794. The ESM import keeps 17's factory shape (`import yargs from 'burgee/yargs/v17'`) and builds no instance at load. Also 17's CommonJS-only `YARGS_MIN_NODE_VERSION` refusal |
| R5 | **Built** 2026-10-19 | `burgee/src/compat.ts`, `compat-oracle/src/hosts.ts` (the `yargs-17` row's `target`, `HostImport.target`, `targetInternals` in CommonJS), `baseline/majors/yargs-17.json` | `scripts/supported-majors-lock.test.ts` with `yargs: [17, 18]`. Red first: `yargs 17 is claimed below level: 191 against a control of 793`. Two harness seams the row needed, each red first in `compat-oracle/src/grade.test.ts` against main's `run.ts` (4 failing): an import may name the module a target run reads (`yargs-parser` is `burgee/yargs/parser` on either major), and a `targetInternals` shim at a `.cjs` path is CommonJS |
| R6 | **Built** 2026-10-12 (commander), 2026-10-19 (yargs) | `burgee/src/migrate.ts`, `PREVIOUS_MAJOR_ENTRIES` in `compat.ts` | `migrate.test.ts`: `rewrites a program pinned to commander 14 (…)` and `rewrites a program pinned to yargs 17 (declared on ~17.7.2 / installed at 17.7.3)`: `yargs` → `burgee/yargs/v17`, `yargs/yargs` → `burgee/yargs/v17/yargs`, `yargs/helpers` → `burgee/yargs/helpers`. Red first on main's `compat.ts`: both yargs cases reported in `offMajor` and left alone. The entry per specifier is data, so the yargs half was two rows |

**Built: 6 of 6.** Shipped 2026-10-19.

**A released defect, fixed 2026-10-26 (polish batch).** After a rewrite to `burgee/commander/v14`
or `burgee/yargs/v17`, `migrate` printed the current major's grade (1,360 / 1,360 or 816 / 816)
beside a program that now runs on the older entry. `compat.ts` gains `GRADED_MAJORS`, keyed as
`baseline/majors/` names its files (`commander-14`, `yargs-17`), and the report's `graded` row
carries `major` and that major's own grade: `commander 14  1331 / 1331`. `compat-baseline-lock.test.ts`
holds each row to its baseline file and to the compatibility page's control, and holds the keys to
the claimed older majors that have an entry. `migrate.test.ts`'s four R6 cases now assert the
grade; red on `main`: `expected [ { host: 'commander', …(4) } ] to match object [ { host:
'commander', …(3) } ]`. No state was added, so there is no model to change.
