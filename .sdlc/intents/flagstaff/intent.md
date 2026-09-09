# Intent — flagstaff: the staff the flag flies from. A frame loop with a static projection, and the plugin host for everything animated

> Stage 1 artifact. Child of [`cli-output-stack`](../cli-output-stack/intent.md), requirements
> U3, U4, U8, U12. **A standalone product**: its competitors are ora, log-update, boxen,
> cli-table3 and Ink; its README leads with the render loop and the plugin contract, and it
> runs with nothing else installed beyond roundel.

**Status:** approved · **Opened:** 2026-09-07 · **Owner:** @ofri-peretz · **Approved:** 2026-09-08 by the owner, in session ("remove all blockers")

---

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
- A spinner snapshot test in `burgee/testing` is deterministic across 20 runs in CI.
- `grep -c $'\r'` over a piped run of the demo reads 0.
- The built-in spinner is registered through the public `register()` and nothing else.
- Spinner subpath at or under ora's measured import cost, on `/benchmarks`.
- ora's, boxen's, cli-table3's and log-update's suites vendored and graded through
  `compat-oracle`; four pass rates on the scoreboard.
- The U9 eval: an agent given the schema and the nyan example writes a new spinner plugin
  that passes `burgee plugin check` in one turn, weekly in `evals/`.
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

- **Plugin discovery.** Explicit `register()` only, or also a `burgee.plugins` field in
  `package.json` the way ESLint flat config lists plugins as an array? Data-first says
  the array; Z1 says nothing may require a config file. Explicit first, discovery only if
  `cli-modularity` needs it for its own plugins.
- **Character and mascot plugins.** A state-keyed frame set is the same shape as a
  spinner with more states. Whether it earns its own key or is just a spinner with named
  states is a design question, and the smaller answer is probably right.
