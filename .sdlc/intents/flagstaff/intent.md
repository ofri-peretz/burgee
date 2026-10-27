# Intent — flagstaff: the staff the flag flies from. A frame loop with a static projection, and the plugin host for everything animated

> Stage 1 artifact. Child of [`cli-output-stack`](../cli-output-stack/intent.md), requirements
> U3, U4, U8, U12. **A standalone product**: its competitors are ora, log-update, boxen,
> cli-table3 and Ink; its README leads with the render loop and the plugin contract, and it
> runs with nothing else installed beyond roundel.

**Status:** approved · **Opened:** 2026-09-07 · **Owner:** @ofri-peretz · **Approved:** 2026-09-08 by the owner, in session ("remove all blockers")

> **Umbrella sweep 2026-10-26: six of eight criteria held on `main` and in `flagstaff@1.7.4`.
> Three of the six are held where their checks actually live
> ([D-20261026-flagstaff-criteria-homes](../../decisions/D-20261026-flagstaff-criteria-homes.md)).
> Open: the weekly U9 eval (no executed reading since 2026-10-09) and the one-case-per-surface
> plugin criterion.** See [§ Umbrella sweep 2026-10-26](#umbrella-sweep-2026-10-26).
>
> **2026-10-27: seven of eight held, the eighth built and waiting on a release.** Criterion 7 is
> met by eval run 40504387711 (D-20261027-dispatched-eval-counts-as-weekly). Criterion 8's three
> cases are `scripts/plugin-surfaces.test.ts` on `main`; two of them need caique's and burgee's
> next minors on npm. See [§ 2026-10-27](#2026-10-27-criterion-7-met-criterion-8-built).

---

## Umbrella sweep 2026-10-26

Read on `main` at `3d079b15` and against `flagstaff@1.7.4` (`npm view flagstaff version` reads
1.7.4, the same as the manifest). The children that shipped are `table-column-widths` and
`frames-fit-the-screen`. `caller-matrix` (shipped) now carries criterion 1's five modes.
`plugin-contract` (`approved`) shares criterion 7's eval.

| # | criterion | held by | state |
| :-- | :-- | :-- | :-- |
| 1 | five plugin conformance cases on the demo | restated home (D-20261026-flagstaff-criteria-homes): the caller matrix's `spinner` and `plugins` rows, `scripts/callers-lock.test.ts` › "names, in every held cell, a test file that exists and a test title that file contains", published at `/docs/callers`. `packages/flagstaff/src/cli.test.ts` › "prints the plugin in all five modes side by side and exits 0". `packages/flagstaff/src/plugin.test.ts` › "R2 · a contribution without a static projection is refused" | held as restated |
| 2 | a spinner snapshot deterministic across 20 runs in CI | restated home: `packages/flagstaff/src/loop.test.ts` › "the tty transcript is the same bytes twenty runs over", under `quality-full.yml`'s `turbo run test` on every non-draft PR | held as restated |
| 3 | no `\r` in a piped run | restated home: `packages/flagstaff/src/shape.test.ts` › "prints one line per state through a pipe: no carriage return, no escape" (the installed tarball, a real pipe) | held as restated |
| 4 | the built-in spinner registered through `register()` and nothing else | `packages/flagstaff/src/plugin.test.ts` › "R3 · the built-ins are a plugin like any other" and the describe "U3, U4 · register() is the only way into the registry" | held |
| 5 | the spinner subpath at or under ora's import cost, on `/benchmarks` | `/docs/benchmarks`: "`flagstaff/spinner` is lighter in a user's bundle than `ora`", 0.121, met. Also `flagstaff/ora ÷ ora` 0.938 bundled and 0.930 at runtime (B5) | held |
| 6 | ora, boxen, cli-table3 and log-update suites graded, four rates on the scoreboard | `packages/compat-oracle/baseline/`: ora 99 / 99, boxen 213 / 213 (9.0.0), cli-table3 29 / 29, log-update 99 / 99. Each row is on `/docs/compatibility` and ratcheted by compat.yml | held |
| 7 | the U9 eval, weekly: an agent writes a spinner plugin that passes `flagstaff check` (written `burgee plugin check`, a name that never shipped) | `evals/cases/flagstaff-plugin-from-schema.json`, cron `20 6 * * 6` (Saturdays since 2026-10-27; `20 5 * * 4` before). It passed on every executed run (2026-10-08 `c5843e3`, 2026-10-09 `3ff3b8e`). 2026-10-15 and 2026-10-22 were `not-run` (`reason: usage-limit`) | **OPEN**: no current reading |
| 8 | one registered plugin in help (theme), in a prompt's spinner and as `--json` events, one case per surface | `scripts/plugin-example-lock.test.ts` proves one object registers in every host and renders flagstaff's spinner in five modes. No case asserts the three named surfaces. caique does not depend on flagstaff, so "a prompt's spinner" has no path from a flagstaff registration | **OPEN** |

**What closes it.**

1. **Criterion 7** is measurement-gated. The next scheduled eval run (Saturday 2026-10-31, 06:20 UTC, an hour after the weekly quota resets: D-20261027-close-three-workflow-gaps)
   has to execute and pass `flagstaff-plugin-from-schema`, read as every **executed** weekly
   reading passing (the `plugin-contract` C4 restatement). It depends on `evals-record-not-run`
   so that a run the usage limit stops is not counted as a reading.
2. **Criterion 8** needs three conformance cases, one per surface: the plugin's `tokens` in burgee
   help, its `spinners` entry in a caique prompt, and its events under `--json`. Alternatively,
   a decision names caique's own spinner surface as the prompt half. The prompt half needs code,
   so caique or flagstaff has to publish.

flagstaff is stamped `shipped` when both are held.

## 2026-10-27: criterion 7 met, criterion 8 built

| # | criterion | held by | state |
| :-- | :-- | :-- | :-- |
| 7 | the U9 eval, weekly | eval run 40504387711 (2026-10-27, `db19cc6`), `evals/history/2026-10-27-db19cc6-40504387711.json`: `flagstaff-plugin-from-schema` and every other plugin case executed and passed, counted as a weekly reading by [D-20261027-dispatched-eval-counts-as-weekly](../../decisions/D-20261027-dispatched-eval-counts-as-weekly.md) (the `plugin-contract` C4 reading) | **held** |
| 8 | one registered plugin in help (theme), in a prompt's spinner and as `--json` events, one case per surface | `scripts/plugin-surfaces.test.ts` › "help: its token colours the flags burgee lists, through the theme seam", › "a prompt's spinner: its frames turn on a terminal, and its static line is what a pipe gets", › "--json: its component arrives as one event per state, by its own name, and stdout is the envelope". The prompt half's path is decided: caique's spinner takes a style as data and caique does not depend on flagstaff ([D-20261027-prompt-spinner-composed](../../decisions/D-20261027-prompt-spinner-composed.md)). The `--json` half needed burgee to hand a handler `ctx.json` | **built on `main`; held on npm** when caique (`spinner({ style })`) and burgee (`ctx.json`) publish their next minors — the first Version PR after the build merges, as there is no release window (D-20261027-no-release-window) |

The help case passes on code that shipped before it (burgee's help theme seam, R7); it is the case
that was missing, and it is red when `paintOf` drops the theme. The other two are red on the
previous `main`: the spinner draws its default frames, and the component prints static lines where
`--json` should have had events. No flagstaff code changed, so flagstaff has no release to wait for.

**Stamp `shipped` when** npm serves the caique and burgee minors carrying `style` and `ctx.json`.

## What is wanted

A zero-dependency package over `Runtime.stdout` and `node:readline` that owns the repaint
loop, and **hosts plugins as data**:

```js
// a third-party plugin, in full
export default {
  name: 'nyan',
  spinners: { nyan: { frames: ['≋', '≈', '~'], interval: 80, static: '…' } },
};
```

- A `task` declares its states once. On a TTY it animates; on a pipe it prints one line per
  state change; under `--json` it emits one event per transition; in accessible mode it
  prints text with no redraw. The static projection (U3) is what the pipe and accessible
  modes print, and a plugin without one is refused at `register()`.
- Built-in spinner, progress, task list, box and table ship as first-party plugins in the
  same shape, so the built-ins cannot grow an API a third party cannot reach (U4).
- Deterministic under test: the clock is injected through `Runtime`, so animated output
  snapshots byte for byte in `burgee/testing`.
- Box, columns and a status line are the whole layout vocabulary (U8).
- **Drop-in for the dozen** (U11): `./ora`, `./box`, `./table` and `./frame` are façades
  over the same loop, graded by ora's, boxen's, cli-table3's and log-update's own suites.
  `- import ora from 'ora'` / `+ import ora from '<pkg>/ora'`, tests unchanged, and the
  spinner now has a static projection it never had.

## Why now

- Claude Code's terminal UI is what CLI authors now want, and it is built on Ink: React
  plus a yoga layout engine. What it actually uses is a spinner, a status line, coloured
  diffs and a box — all L2 components, no flexbox. The niche is a render loop without
  React, and it is empty.
- clack #585 and #510: live redraws are re-announced by screen readers and captured
  verbatim by agents. Every incumbent component is imperative and has no answer. The
  static projection is the answer, and it is the same move as the manifest.
- ora has no plugin surface and no testing story; `cli-spinners` is a JSON file that
  proves the data-first contract already works in the wild.

## Affected users and systems

- New `packages/flagstaff`, published as `flagstaff` (candidate), with a real
  dependency on `roundel` for `./policy` and `./tokens` (U1, U6: same-repo dependencies are
  allowed). Its own README, docs section and benchmark page against ora and Ink (U12).
  The published weight row lists the closure: "0 external, 1 same-repo".
- `caique` depends on this for its spinner and progress (same-repo, U6); its prompt widgets
  are its own, and clack is only a migration path.
- `examples/` gains the plugin conformance cases; the docs site gets a plugin gallery
  generated from registered plugins' `static` fields, so the gallery is itself a
  projection.
- `cli-benchmarks` B4: the spinner subpath's ceiling is ora's import cost, measured when
  ora is added to the bench workspace.

## Constraints

1. **A plugin is inspectable without execution** (U4): an object with `name` and any of
   `tokens`, `spinners`, `glyphs`, `components`. At most one optional `frame(t, state)`
   function per component, for the rare style that draws itself.
2. **`static` is mandatory** on every animated contribution, or derivable from a final
   state and label. Registration throws `E_NO_STATIC_PROJECTION` with a `fix`.
3. Under `pipe`, `json`, `accessible` and `ci` modes the loop never writes `\r` or a
   cursor escape. One conformance case greps for them.
4. No layout engine (U8): no measure pass, no constraint solver, no nesting deeper than a
   box in a column. Locked by a test that fails when the source grows a `layout` module.
5. Nothing reads `process.*` or `Date.now()` directly; time and streams come from
   `Runtime`. The process-reference lock extends here.
6. Zero external runtime dependencies (U6); `roundel` is the only dependency. Z1 shape
   test and K5 ratchet (U7), with the ratchet measuring the installed closure.
7. **Authored by an agent, integrated by one call** (U9). The plugin object's JSON Schema
   ships in the package and in `llms.txt`; `burgee plugin check ./nyan.mjs` validates it
   and prints the spinner in `tty`, `pipe`, `json` and `accessible` modes side by side.
   `register(plugin)` is the only wiring: tokens reach the help renderer's theme seam,
   spinners reach `caique`, task events reach the `--json` envelope.
8. ESM with a `default` condition, `sideEffects: false`, one subpath per component;
   `{ spinner }` from the root entry tree-shakes to the `./spinner` bytes (U10).

## Success criteria

- The five plugin conformance cases pass on the demo: TTY animates, pipe prints one line
  per state, `--json` emits events, accessible prints text, missing `static` is refused.
  *(Restated 2026-10-26 ([D-20261026-flagstaff-criteria-homes](../../decisions/D-20261026-flagstaff-criteria-homes.md)): held by the caller matrix's `spinner` and `plugins` rows and
  flagstaff's own suites. No demo draws with flagstaff.)*
- A spinner snapshot test in `burgee/testing` is deterministic across 20 runs in CI.
  *(Restated 2026-10-26 ([D-20261026-flagstaff-criteria-homes](../../decisions/D-20261026-flagstaff-criteria-homes.md)): `flagstaff/src/loop.test.ts`, on every non-draft PR.)*
- `grep -c $'\r'` over a piped run of the demo reads 0. *(Restated 2026-10-26 ([D-20261026-flagstaff-criteria-homes](../../decisions/D-20261026-flagstaff-criteria-homes.md)): a piped
  run of the installed tarball, `flagstaff/src/shape.test.ts`.)*
- The built-in spinner is registered through the public `register()` and nothing else.
- Spinner subpath at or under ora's measured import cost, on `/benchmarks`.
- ora's, boxen's, cli-table3's and log-update's suites vendored and graded through
  `compat-oracle`; four pass rates on the scoreboard.
- The U9 eval: an agent given the schema and the nyan example writes a new spinner plugin
  that passes `burgee plugin check` in one turn, weekly in `evals/`. *(2026-10-26 ([D-20261026-flagstaff-criteria-homes](../../decisions/D-20261026-flagstaff-criteria-homes.md)): the
  command is `flagstaff check`, which `burgee check` runs. Still open: no executed reading since
  2026-10-09.)*
- A plugin registered once appears in help (theme), in a prompt's spinner, and as events
  under `--json` — one conformance case per surface.

## Verified against `main` — 2026-09-09

Checked criterion by criterion on `61bd11b9`. **One of eight fully met.** The status stays
`approved` — the owner's Design→Build gate of 2026-09-08 — and that is all it claims. Most of
the behaviour these criteria describe does exist and is tested; what fails is that four of them
name a home the work does not live in, and three name an artifact that does not exist.

- **Five plugin conformance cases on the demo** — not met where the criterion puts them. No
  `examples/demo-cli-*` imports flagstaff. All five behaviours are asserted as package unit
  tests: `src/loop.test.ts` "R1 · one component, five modes" and `src/plugin.test.ts` "R2 · a
  contribution without a static projection is refused".
- **A deterministic spinner snapshot in `burgee/testing`, 20 runs** — not met at that address.
  `packages/burgee/src/testing.ts` carries no spinner surface. The 20-run determinism test is
  real but lives at `src/loop.test.ts:122` — "the tty transcript is the same bytes twenty runs
  over" — and runs in `quality-full.yml`, not on every PR.
- **A piped demo run carries no carriage return** — the same displacement.
  `src/loop.test.ts:117` asserts no ESC and no CR across pipe, ci, json and accessible, and
  `src/shape.test.ts:59` asserts it on a real piped run of the installed tarball. Neither is
  a demo CLI.
- **The built-in spinner registered through the public `register()` and nothing else** —
  **met.** `src/plugin.test.ts` "R3 · the built-ins are a plugin like any other" and "U3, U4 ·
  `register()` is the only way into the registry".
- **The spinner subpath at or under ora's import cost, on `/benchmarks`** — not met. The bytes
  hold — `flagstaff/spinner` 12,418 B; `flagstaff/ora` + `roundel/chalk` 56,127 B against ora
  9.4.1's 113,577 B over 17 packages — but `/benchmarks` is 404, so nothing is published.
- **ora's, boxen's, cli-table3's and log-update's suites graded; four rates on the scoreboard**
  — three of four. ora 99 / 99, log-update 99 / 99, boxen 84 / 84, each with its control
  (2026-09-09). cli-table3 has no vendor directory on `main` and is blocked by a recorded
  decision. Separately, `apps/docs/content/docs/compatibility.mdx` is stale: it still lists
  boxen as *planned* and carries no boxen row, though `results.json` records 84 / 84.
- **The U9 eval, one turn, weekly** — stale in its wording and unmet in fact. The criterion says
  `burgee plugin check`; the command shipped as `flagstaff check` (`burgee plugin check` returns
  `error: unknown command "plugin"`), and the eval case already invokes the shipped name. Unmet
  because layer 2 skips for lack of a credential in every run, and no scheduled run has fired.
- **One plugin visible in help, in a prompt's spinner, and as `--json` events** — not met, and
  currently unbuildable: `caique` has no plugin or widget surface (its exports are `.`, `./ask`,
  `./binding`, `./decide`, `./raw`, `./spec`, `./terminal`), so "a prompt's spinner" has nowhere
  to land.

## Open questions

- **Plugin discovery.** **Decided 2026-09-20 → D-028.** Explicit `register()` only, or also a `burgee.plugins` field in
  `package.json` the way ESLint flat config lists plugins as an array? Data-first says
  the array; Z1 says nothing may require a config file. Explicit first, discovery only if
  `cli-modularity` needs it for its own plugins.
- **Character and mascot plugins.** **Decided 2026-09-20 → D-029.** A state-keyed frame set is the same shape as a
  spinner with more states. Whether it earns its own key or is just a spinner with named
  states is a design question, and the smaller answer is probably right.
