# Intent — The foundation stack: the four layers a CLI stands on, taken by consolidation rather than by weight

> Stage 1 artifact. Umbrella for [`linegauge`](../linegauge/intent.md),
> [`seniority`](../seniority/intent.md), [`bellpull`](../bellpull/intent.md) and
> [`closeout`](../closeout/intent.md). Child of
> [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md); peer of
> [`cli-output-stack`](../cli-output-stack/intent.md). Proposes floor additions Y1–Y12.
> Opened from [`candidate-layers.md`](../../research/candidate-layers.md), the 2026-09-08
> measurement pass, and the four names published 2026-09-09.

**Status:** draft · **Opened:** 2026-09-09 · **Owner:** @ofri-peretz

---

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
- **Two of the four are being written anyway.** `flagstaff/design.md` already schedules
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
- `agent-native-cli-layer/design.md` gains Y1–Y12.
- `.sdlc/research/replacement-map.md` becomes the generated source of the mapping table
  rather than a hand-written one.

## Constraints

1. **The arrow points down and never back (Y1).** A foundation package depends on nothing
   but Node. `burgee` never imports one. `flagstaff` and `caique` may, because they are
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
7. **The format parsers stay out.** YAML, JSON5, TOML and INI are a different family under
   rule 10. `seniority` accepts a loader; it does not become a parser vendor.

## Success criteria

- Four packages published at `0.1.0`, each importable from its tarball in one file, each
  with a benchmark row under the lightest zero-dependency incumbent in its layer.
- Thirteen vendored suites graded and ratcheting on the public scoreboard.
- **The override recipe published with its number**: a documented `overrides` block that
  collapses this repo's own tree from 41 replaceable copies to 4 packages, reproducible by
  a reader on their own project, and refused by CI until the pass rate justifying it is
  green.
- `flagstaff` deletes `src/width.ts` and `caique` deletes its signal handling, both with
  their suites unchanged — the internal proof that the consolidation is real.
- One external adopter using a foundation package with no other burgee package installed.
  This is the test that these are products rather than internals with a README.

## Open questions

- **Does `seniority` move ahead of `linegauge` in the order?** It is the biggest layer
  (1.81 B/wk) *and* the cheapest to start, because `precedence.ts` already exists. The
  ordering below is driven by what unblocks already-scheduled work, not by size; the
  criterion for pulling it forward is recorded in `design.md`.
- **Does `bellpull` survive a re-check?** `tinyexec` — 119 M/wk, zero dependencies,
  published 2026-09-03 — already owns the weight pitch. Its trajectory is a kill signal,
  and `bellpull` is last for that reason.
- **Does `config-layers` become a competitor?** First published 2026-09-08, the same day
  this layer was measured. Somebody else is moving here now.
- **Where does the `Runtime` seam live for four packages that are not allowed to import
  burgee?** Each declaring its own structural type is four definitions of one shape; a
  shared type-only package is a fifth package. Deferred to `design.md`.
