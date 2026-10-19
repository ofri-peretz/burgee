# Intent — `paratext`

Everything around your terminal output that is not the output — hyperlinks, inline images,
the window title, the clipboard, desktop notifications, the working directory, the bell —
as one zero-dependency package that **never emits a sequence it cannot prove the terminal
understands**, and falls back to a static projection when it cannot.

**Status:** shipped · **Opened:** 2026-09-13 · **Owner:** @ofri-peretz · **Name published:** `paratext@0.2.0` · **Shipped:** 2026-10-18 on [`1013b65db5`](https://github.com/ofri-peretz/burgee/commit/1013b65db5), verified against `main` at `1013b65db5` — all 6 criteria locked by paratext's own suites, flagstaff's `link`/`table` tests, the plugin-schema and ceilings locks, and the graded suites

> Written after the package shipped. `paratext` reached npm at 0.2.0 with 5 source files
> and 40 tests and no Stage 1 or Stage 2 artifact — the same failure as `brand-burgee`,
> "built ahead of its gate". This intent records what was built and what remains, so the
> roadmap can hold it to something. The audit that found the gap is in the roadmap README.

---

## What is wanted

A CLI that wants a clickable filename, a tab title, an image in iTerm2, or a bell when a long
job finishes gets all of it from one import, and gets **the right thing on every terminal**:
the OSC sequence where it is known to work, a plain-text projection everywhere else. Three
packages do this today and every one of them emits the bytes and hopes.

Concretely:

- `link`, `title`, `image`, `clipboard`, `notify`, `cwd`, `bell` — the seven built-ins, each
  a *capability record* rather than a function, so a caller can read what it will emit before
  it emits it. Where a function wrapper exists it takes the incumbent's argument order:
  `link(text, url)`, as `ansi-escapes` and `terminal-link` have it.
- `emit(runtime, name, fields)` returns the OSC sequence when `supports()` says the terminal
  does, and the capability's `fallback` template otherwise — **never raw OSC on an unknown
  terminal**. (An earlier wording here also promised "never an empty string". That was never
  true and was not meant to be: `title`, `clipboard`, `cwd` and `bell` all project to `''`
  deliberately, a window title having nothing to say in a log. Corrected 2026-09-15 —
  see `spec.md`, *What the design claimed and the code does not do*.)
- A narrow entry point per capability a consumer can afford to import statically. `paratext`
  itself registers all seven at import and reaches 17,574 B; `paratext/link` is 2,337 B and
  registers nothing, which is what let `burgee`'s `--help` take the dependency at all.
- `register(capability)` adds or replaces a capability. The built-ins use the same call, so a
  terminal we mis-detect is corrected by a caller in three lines, not by a fork.
- The default export path is call-compatible with `ansi-escapes` for the OSC subset, so
  `overrides: { "ansi-escapes": "npm:paratext@^1" }` resolves for a program that only used
  that subset.

## Why now

- **The incumbents are the largest packages in the foundation tier and the least safe.**
  `ansi-escapes` is 91.8 M downloads/week, `terminal-link` 15.3 M, `term-img` 0.17 M
  (measured 2026-09-13, `api.npmjs.org/downloads/point/last-week`). All three emit OSC
  unconditionally; `terminal-link` and `term-img` each pull `ansi-escapes` plus a detector
  (`supports-hyperlinks`, `iterm2-version`) as dependencies — **two packages to detect, one
  to emit, and the detection is the part that is wrong on a new terminal.**
- **Nothing in this layer is detectable at runtime.** No terminal answers "do you do OSC
  1337". So the correct design is a table of known terminals plus a fallback, and a table
  goes stale faster than a release cycle — which is why the surface is a registry. This is
  the one foundation package whose *shape* is forced by the medium rather than chosen.
- **The output stack needs it and cannot import it yet.** `flagstaff`'s table and box would
  make paths clickable and `burgee`'s `--explain` would link a config file, but roundel
  (SGR) and flagstaff (CSI) stop at the character grid by design. OSC has no owner without
  this package.

## Affected users and systems

- `packages/paratext` — the package. `flagstaff` and `burgee` as future consumers (Y1 lets
  them reach down).
- `compat-oracle` — three suites to vendor: `ansi-escapes`, `terminal-link`, `term-img`.
- `benchmarks` — B4 rows for `paratext ÷ ansi-escapes`; a `foundation-ceilings` entry.
- `/docs/benchmarks` and the package README — the consolidation number (Y2).
- The published npm description says "drop-in paths for ansi-escapes, terminal-link and
  term-img" **today, against zero vendored suites**. That claim is what R9 below makes true
  or removes.

## Constraints

- Zero external dependencies; imports nothing from the family (foundation tier, Y1).
- Exactly one file reads `process` — `src/runtime.ts`, the `Runtime` seam (Y9). Verified:
  `grep -n "process\." packages/paratext/src/*.ts` names only that file.
- Every capability carries a `fallback` (Y5). Verified: 8 `fallback` fields in
  `builtins.ts` for 7 built-ins plus the template.
- The plugin schema must become the family's shared one (`plugin-contract`), not a fourth
  shape. Today `packages/paratext/src/schema.json` hashes to `409dbeb2…` where roundel and
  flagstaff share `2f1bd1c6…`.
- Weight: 14,062 B of `dist/` today; the ceiling is the lightest zero-dependency incumbent
  in the layer (Y8), to be measured — none of the three is zero-dep, so the ceiling is
  `ansi-escapes` minus its `environment` dependency.

## Success criteria

1. `emit()` on a runtime with no terminal information returns the fallback for all seven
   built-ins — asserted, and asserted to contain no `ESC ]`.
2. `ansi-escapes`' suite vendored and graded with `--control`; the OSC subset passes and the
   CSI subset is *explicitly out of scope* in the baseline, not silently failing.
3. `terminal-link`'s and `term-img`'s suites vendored and graded the same way.
4. `schema.json` is byte-identical to roundel's and flagstaff's, with paratext's fields under
   a `capabilities` key — one plugin object registers into all three.
5. A B4 row and a `/docs/benchmarks` entry exist; the README links it.
6. `flagstaff/table` renders a clickable path through `paratext` on a supporting terminal
   and a plain path elsewhere — the first same-repo consumer, proving the arrow.

## Shipped — 2026-10-18

**Status raised to `shipped`.** Every criterion was checked against `main` at `1013b65db5` in the
roadmap-to-shipped Batch 0 pass (`.sdlc/research/roadmap-to-shipped-2026-10.md`).

| criterion | check | result |
| :-- | :-- | :-- |
| 1. no terminal information: all seven built-ins fall back, with no `ESC ]` | `vitest --root packages/paratext` | 286 passed |
| 2. `ansi-escapes` graded with `--control`, CSI scoped in the baseline | `npm run compat -- ansi-escapes … --control`, then the target | control ansi-escapes 4 / 4, terminal-link 8 / 8, term-img 18 / 18; target ansi-escapes 4 / 4, terminal-link 8 / 8, term-img 18 / 18 |
| 3. `terminal-link` and `term-img` graded the same way | the same two runs | as above |
| 4. one plugin schema for all three | `plugin-schema-lock.test.ts`, `plugin-schema-agreement.test.ts` | 166 passed (with `foundation-ceilings-lock`, `package-shape-lock`) |
| 5. a B4 row and a `/docs/benchmarks` entry, linked from the README | `npm run bench -- --axis weight --check`; `npm run bench:page -- --check` | 0 gate failures; the page matches the committed results |
| 6. `flagstaff/table` links through paratext, plain elsewhere | flagstaff `link.test.ts`, `table.test.ts` | 42 passed |

**R11, the 1.65× ratio over `ansi-escapes`, is accepted as a held ratchet**, the way closeout's two
drop-in ratios are held:
[`D-20261018-paratext-ratio-held-ratchet`](../../decisions/D-20261018-paratext-ratio-held-ratchet.md).
The layer is at **0.0534** of its D1 ceiling in `foundation-ceilings.json`. The bundled row against
`ansi-escapes` alone read 1.632 in this run (1.647 when the ratchet was set), ratcheted at 1.65 under D-157. The bytes over the incumbent are the
capability registry that makes every sequence degrade on a pipe, and the gate stops them growing.

## Open questions

- Whether `image` should accept a path as well as a buffer **Decided 2026-09-20 → D-030.** — `term-img` does, and it means
  `node:fs` in a package that otherwise touches nothing. Leaning: no; the caller reads the
  file and owns the I/O. *Superseded 2026-09-30 for `paratext/term-img` only →
  D-20260930-paratext-term-img-path: that subpath reads a path, and the root stays bytes-only.*
- Whether the `Support` table for known terminals lives in the package **Decided 2026-09-20 → D-031.** or in a data file a
  plugin can replace wholesale. Leaning: data file, because that is the thing that rots.
