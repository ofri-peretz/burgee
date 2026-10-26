# Intent — The foundation stack: the four layers a CLI stands on, taken by consolidation rather than by weight

> Stage 1 artifact. Umbrella for [`linegauge`](../linegauge/intent.md),
> [`seniority`](../seniority/intent.md), [`bellpull`](../bellpull/intent.md) and
> [`closeout`](../closeout/intent.md). Child of
> [`burgee`](../burgee/intent.md); peer of
> [`cli-output-stack`](../cli-output-stack/intent.md). Proposes floor additions Y1–Y12.
> Opened from [`candidate-layers.md`](../../research/candidate-layers.md), the 2026-09-08
> measurement pass, and the four names published 2026-09-09.

**Status:** approved · **Opened:** 2026-09-09 · **Owner:** @ofri-peretz

> **Accepted at the Design→Build gate 2026-10-25** by the coordinator under the owner's delegation
> ([`D-20261025-cli-foundation-stack-design-accepted`](../../decisions/D-20261025-cli-foundation-stack-design-accepted.md)): the umbrella over four shipped children; Y4 and Y12 to build, Y2's downloads half and S3 dropped. See
> [`spec.md` § Design gate 2026-10-25](./spec.md#design-gate-2026-10-25).
>
> **Built 2026-10-25 (batch 29), still `approved` until the four packages publish:** the Y4 lock,
> the absorption probe and the Y12 lock are on `main`. The README text they hold reaches npm with
> the next Version PR, through the patch changesets this batch adds. See
> [`spec.md` § Status 2026-10-25](./spec.md#status-2026-10-25).

**Restated:** 2026-10-18 — see § Restated 2026-10-18

---

## Restated 2026-10-18

**The four packages shipped (all at 1.x) and most rows close through the children; five pieces have no owner. REMAINING: Y2 incumbent-count and weekly-downloads half unlocked, Y4 platform-absorption check per Node LTS unbuilt, Y12 no-burgee README opening unlocked, S3 override-collapse recipe and tree-walk check (needs a new intent), S5 outside adopter of one layer (needs a new intent; gap C3).** *2026-10-19: S5 moved → `first-adopter` A6; four remain, and the umbrella stays `draft`.*

Read on `main` at `1013b65db5` (2026-10-18); no test was run, and every check below was located
on that commit by file and test name. Requirements Y1–Y12 are mapped in
[`spec.md` § Restated 2026-10-18](./spec.md#restated-2026-10-18). This section maps the five
success criteria, S1–S5 in the order they appear under `## Success criteria`, and the two
constraints the tree contradicts. Nothing is deleted; each criterion keeps its text.

| ID | promised | on main | check | disposition |
| :-- | :-- | :-- | :-- | :-- |
| S1 | four packages at `0.1.0`, importable from the tarball in one file, each with a benchmark row under the lightest zero-dependency incumbent | published: `linegauge` 1.1.1, `seniority` 1.0.8, `bellpull` 1.0.6, `closeout` 1.1.3; each tarball installs alone and every entry loads. The benchmark bar is restated by PLAN D1 to the incumbents' tree-inclusive installed bytes (`.sdlc/bands/foundation-ceilings.json`); per-layer status is the children's Y8 rows | `scripts/independence-install-lock.test.ts` › "loads every module entry in its `exports` map"; `scripts/foundation-ceilings-lock.test.ts` › "agrees with itself: the ceiling is the sum, and the ratio is ours over it" | held for publish and import; the benchmark half moved → `linegauge` R9, `seniority` R9, `bellpull` R8, `closeout` R8 and `closeout-at-incumbent-weight` S1 |
| S2 | thirteen vendored suites graded and ratcheting on the public scoreboard | all thirteen vendored, each with a baseline: string-width 233 / 233, wrap-ansi 85 / 85, strip-ansi 8 / 8, slice-ansi 104 / 104, signal-exit 134 / 135, exit-hook 21 / 21, cosmiconfig 242 / 243, lilconfig 77 / 77, dotenv 191 / 191, rc 1 / 1 (exit-code mode), cross-spawn 68 / 68, which 5 / 5, and execa 0 / 1179 declared a `ceiling`, not a drop-in (D-160), so no recipe or `burgee migrate` names `bellpull` as execa's replacement | `.github/workflows/compat.yml` job "Ratchet · each host's suite against burgee" over `packages/compat-oracle/baseline/<host>.json`; `scripts/compat-page.test.ts` › "is drift when a measured number moved, and names the line and both values" | held via `linegauge` R10, `closeout` R9, `seniority` R10, `bellpull` R9 |
| S3 | an `overrides` recipe that collapses this repo's tree from 41 copies to 4 packages, reproducible, refused by CI until its pass rate is green | not built. D-133 withdrew the multi-incumbent `overrides` recipe: an override can only aim at a package root, a root has one default, and the drop-ins are subpaths swapped by import (`burgee migrate`). The only printed recipe left is checked to resolve. No collapse measurement and no tree-walk test exist | `scripts/override-recipe-lock.test.ts` › "an overrides recipe resolves against our root" holds what is printed; nothing holds the collapse | remaining: needs a new intent (the collapse number on a real tree, restated after D-133 to the incumbents whose root is a drop-in, plus the tree-walk check in `spec.md` § Verification). No existing intent covers it: `graded-override-targets` grades six more stand-ins and does not measure a collapse |
| S4 | `flagstaff` deletes `src/width.ts` and `caique` its signal handling, suites unchanged | done: `packages/flagstaff/src/width.ts` does not exist and width comes from `linegauge`; `caique` restores the terminal through `closeout/cursor` and `closeout/exit-hook`, and its only file that names the process is `runtime.ts` | `packages/flagstaff/src/plugin.test.ts` › "no module here declares a width or measure pass of its own — every one comes from linegauge"; `packages/caique/src/keys.test.ts` › "registers on closeout’s exit hook when no registry is given"; `packages/burgee/src/process-reference-lock.test.ts` › "no layer source reads process.* outside the three files that own it" | held |
| S5 | one external adopter using a foundation package with no other burgee package installed | not met. D-20261009-burgee-u12-1-0 took the outside adopter out of every release gate and tracks it as `.sdlc/gaps/C3.md` ("a CLI we did not write, installing one layer alone"). The engineering half (installs alone) is held by `scripts/independence-install-lock.test.ts` | none for the adopter | moved → `first-adopter` A6 (2026-10-19), which names a lone foundation layer; was "remaining: needs a new intent, or a rewrite of `first-adopter`" |

**Constraints and design text the tree contradicts.**

- **Constraint 6, "Node ≥ 24"** — restated by D-132 (2026-09-23): every published package
  declares `engines.node` `^20.19.0 || >=22.13.0`, and `compat.yml`'s `floor` job runs each
  published suite on exactly 20.19.0 and 22.13.0. Held by `scripts/package-shape-lock.test.ts`
  › "is ESM, requires Node ^20.19.0 || >=22.13.0, and declares no legacy main (K2)" and the
  `the Node floor (K2, C3, D-132)` block beside it.
- **Constraint 1 and *Affected users*, "`burgee` never imports one"** — reversed. PR #219
  (`ac7b9e5c30`, "the layer owns precedence, and Y1 stops forbidding its use") let any family
  package depend on the foundation, and `packages/burgee/package.json` now depends on
  `bellpull`, `closeout`, `linegauge` and `seniority` (and `roundel`). Recorded as `burgee/spec.md`
  U1, restated by D-130. What survives, and is locked, is the half that was load-bearing: a
  foundation package depends on nothing. See `spec.md` Y1.
- **`spec.md` § Out of scope, "A CLI in any of the four packages. They are libraries."** — every
  package now ships a `bin` (`dist/cli.js`). It is not a CLI product: it is the `check` command
  PRINCIPLES 7 asks of every plugin surface (`linegauge check <file>` validates a plugin), held by
  `scripts/extension-surface-lock.test.ts` › "the check column is true exactly where a `check`
  command exists" and `scripts/bin-shebang-lock.test.ts` › "finds the family's bins". The
  libraries are still libraries; `burgee` still owns the command line.
- **Constraint 2, "the stubs stay at `0.0.1`" until the commander scoreboard is public** — met
  and spent: `.sdlc/bands/scoreboard-public.json` names the page since 2026-09-09. The
  `release.yml` gate that enforces it covers `roundel`, `flagstaff` and `caique` only.
- **The tier is six packages, not four.** `scripts/package-shape-lock.test.ts`'s `FOUNDATION`
  is `bellpull`, `closeout`, `linegauge`, `paratext`, `roundel`, `seniority`; `paratext` and
  `roundel` joined on the same terms. This umbrella's rows still name the four it opened with.

## What is wanted

The output stack is what a CLI **shows**. This is what it **stands on**: measuring text,
resolving configuration, running another program, and ending cleanly. Four packages, all
already reserved on npm, each an independent product graded by the incumbents it replaces.

| Package | Layer | Owns | Incumbents | Weekly |
| :-- | :-- | :-- | --: | --: |
| [`linegauge`](../linegauge/intent.md) | text | width · wrap · truncate · slice · strip · widest | 12 | 2.16 B |
| [`seniority`](../seniority/intent.md) | config | precedence · discovery · provenance | 16 | 1.81 B |
| [`bellpull`](../bellpull/intent.md) | subprocess | resolve · spawn · a projectable result | 15 | 2.29 B |
| [`closeout`](../closeout/intent.md) | lifecycle | exactly-once handlers · terminal restore · bounded shutdown | 6 | 685 M |
| | | **total** | **49** | **6.94 B** |

Counts and figures from [`replacement-map.md`](../../research/replacement-map.md), measured
2026-09-09; they include the incumbents' own transitive dependencies, because those are what
actually leave a tree when the top-level package does. The 747 M/wk of format parsers
(`js-yaml`, `json5`, `yaml`, `ini`) are deliberately **not** counted and **not** taken — a
different family under rule 10.

Once this lands, the claim on the front page changes shape. Today it is *"burgee has zero
dependencies."* That is true and it is nearly worthless to a user, because **zero
dependencies stops us adding to a tree; it does not shrink theirs.** This repo carries six
copies of `string-width` while publishing nothing that depends on it. After this, the claim
is a measured subtraction: **41 replaceable copies and 1.58 MB in this repo's own tree,
collapsible to 4 packages** through npm alias overrides — a number a stranger can reproduce
on their own `node_modules` with one command.

## Why now

- **The four names are live and empty.** `linegauge@0.0.1`, `seniority@0.0.1`,
  `bellpull@0.0.1` and `closeout@0.0.1` were published 2026-09-09 as reservation stubs that
  export their own name and nothing else. A reserved name with no roadmap decays into
  squatting, which is exactly what made `fathom`, `tender`, `halyard` and `ballast`
  unusable to everyone. This intent is what makes the reservation honest.
- **Two of the four are being written anyway.** `flagstaff/spec.md` already schedules
  `src/width.ts` — *"display width of a string (East Asian wide, combining, ANSI-stripped)"* —
  because rule 2 forbids depending on `string-width`. `caique/intent.md` already promises
  *"cancellation returns `CANCELLED` and `Ctrl+C` restores the terminal"*, which **is**
  `closeout`. And `packages/burgee/src/precedence.ts` is 153 lines of shipped, pure
  `resolve(specs, layers) → { values, provenance }`, which is the core of `seniority`.
  Publishing these is the marginal cost of grading and polish, not of invention.
- **The "why now" that was expected is false, and the real one is stronger.** The incumbents
  are not trapped on old Node. `string-width` declares `>=20`, `execa` and `ansi-styles`
  declare `>=22`; `Intl.Segmenter`, `util.styleText` and `util.parseArgs` are available to
  every one of them today and unused. The gap is **pace, not capability**, and the sharpest
  single line of evidence is one manifest: `execa` declares `engines: ">=22"` and ships
  **12 direct dependencies, 16 packages, 1.42 MB**. A modern floor carrying a legacy tree.
- **Staleness at volume, which is the same finding in four places.** `signal-exit`:
  199 M/wk, last published **2023-07-29**. `resolve-from`: 214 M/wk, **2019-04-15**.
  `path-exists`: 204 M/wk, **2021-08-12**. `rc`: 30 M/wk, **2018-05-26**. `wcwidth`:
  44 M/wk, **2016-05-30**.
- **One chain is the whole argument in four packages.** `find-up` → `locate-path` →
  `p-locate` → `path-exists`: **809 M weekly downloads** to answer *"is there a file called
  X in this directory or any above it."* On Node 24 that is a loop and `fs.existsSync`.

## Affected users and systems

- Four existing stub packages under `packages/` gain real implementations, in this one repo
  so an agent's context holds the whole stack (rule 10). Each keeps its own README, its own
  competitors and its own benchmark page (Y12); none mentions burgee above the fold.
- **`packages/burgee` gains no dependency on any of them.** The precedent is `roundel`:
  burgee keeps its own `precedence.ts` and its own four `styleText` calls, and the two
  copies share a test-vector file. Reversing that arrow would make the engine's zero-dep
  claim conditional on four more packages (Y1).
- `flagstaff` takes `linegauge` as a same-repo dependency instead of writing `src/width.ts`;
  `caique` takes `closeout` instead of implementing its own signal handling.
- `compat-oracle` vendors thirteen more suites — `string-width`, `wrap-ansi`, `strip-ansi`, `slice-ansi`, `signal-exit`, `exit-hook`,
  `cosmiconfig`, `lilconfig`, `dotenv`, `rc`, `execa`, `cross-spawn` and `which` —
  and the scoreboard grows thirteen rows.
- `cli-benchmarks` B4 gains a per-package row **and a new axis**: the override collapse,
  measured on a real tree.
- `burgee/spec.md` gains Y1–Y12.
- `.sdlc/research/replacement-map.md` becomes the generated source of the mapping table
  rather than a hand-written one.

## Constraints

1. **The arrow points down and never back (Y1).** A foundation package depends on nothing
   but Node. ~~`burgee` never imports one.~~ **Reversed (PR #219, D-130):** `burgee` depends on
   four of them; the foundation still depends on nothing. `flagstaff` and `caique` may, because they are
   above the line and in this repo (U1, U6).
2. **Nothing here publishes a working release before the commander scoreboard is public.**
   The same lock the output stack carries (`cli-output-stack` design R-order). The stubs
   stay at `0.0.1` until then.
3. **Consolidation is the pitch and it is a number (Y2).** Every package publishes the count
   of incumbents it replaces and the bytes it removes from a real install, measured by
   `npm i` + `du`, never from a size badge.
4. **Grade before recommending, always (Y7).** An override edits packages deep in a
   stranger's tree; if the drop-in is not exact, the breakage is remote and baffling. The
   pass rate is a safety interlock, not marketing. No swap recipe ships before its number.
5. **Anything that can hang gets a deadline (Y10).** Cleanup, spawn, and the discovery walk.
   Finite by default, overridable, never infinite. A hung handler is the failure mode that
   strands an agent with no human on deck.
6. **Zero external runtime dependencies, ESM with a `default` condition, Node ≥ 24**
   (U6, K2), and nothing reads `process.*` (T1, Y9).
   **Restated 2026-10-18:** the Node floor is `^20.19.0 || >=22.13.0` (D-132).
7. **The format parsers stay out.** YAML, JSON5, TOML and INI are a different family under
   rule 10. `seniority` accepts a loader; it does not become a parser vendor.

## Success criteria

- Four packages published at `0.1.0`, each importable from its tarball in one file, each
  with a benchmark row under the lightest zero-dependency incumbent in its layer.
  **S1, 2026-10-18:** held for publish and import (1.x); the benchmark half moved to the children's Y8 rows.
- Thirteen vendored suites graded and ratcheting on the public scoreboard.
  **S2, 2026-10-18:** held; execa is graded as a ceiling, 0 / 1179 (D-160).
- **The override recipe published with its number**: a documented `overrides` block that
  collapses this repo's own tree from 41 replaceable copies to 4 packages, reproducible by
  a reader on their own project, and refused by CI until the pass rate justifying it is
  green.
  **S3, 2026-10-18:** remaining; the multi-incumbent recipe was withdrawn by D-133. Needs a new intent.
  **Dropped 2026-10-25** at the design gate: after D-133 a collapse would measure one package.
- `flagstaff` deletes `src/width.ts` and `caique` deletes its signal handling, both with
  their suites unchanged — the internal proof that the consolidation is real.
  **S4, 2026-10-18:** held.
- One external adopter using a foundation package with no other burgee package installed.
  This is the test that these are products rather than internals with a README.
  **S5, 2026-10-18:** remaining; tracked as `.sdlc/gaps/C3.md` (D-20261009-burgee-u12-1-0). Needs a new intent.
  **Moved 2026-10-19** to `first-adopter` A6.

## Open questions

- **Does `seniority` move ahead of `linegauge` in the order?** **Decided 2026-09-20 → D-047.** It is the biggest layer
  (1.81 B/wk) *and* the cheapest to start, because `precedence.ts` already exists. The
  ordering below is driven by what unblocks already-scheduled work, not by size; the
  criterion for pulling it forward is recorded in `spec.md`.
- **Does `bellpull` survive a re-check?** **Decided 2026-09-20 → D-048.** `tinyexec` — 119 M/wk, zero dependencies,
  published 2026-09-03 — already owns the weight pitch. Its trajectory is a kill signal,
  and `bellpull` is last for that reason.
- **Does `config-layers` become a competitor?** **Decided 2026-09-20 → D-049.** First published 2026-09-08, the same day
  this layer was measured. Somebody else is moving here now.
- **Where does the `Runtime` seam live for four packages **Decided 2026-09-20 → D-069.** that are not allowed to import
  burgee?** Each declaring its own structural type is four definitions of one shape; a
  shared type-only package is a fifth package. Deferred to `spec.md`.
