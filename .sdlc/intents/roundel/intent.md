# Intent — roundel: the colours a CLI carries. One output policy, semantic tokens, a theme, and a chalk migration path lighter than chalk

> Stage 1 artifact. Child of [`cli-output-stack`](../cli-output-stack/intent.md), requirements
> U2, U5, U6, U7, U12. **A standalone product**: its competitors are chalk and picocolors, its
> README never mentions burgee above the fold, and it is useful with nothing else installed.

**Status:** approved · **Opened:** 2026-09-07 · **Owner:** @ofri-peretz · **Approved:** 2026-09-08 by the owner, in session ("remove all blockers")

---

## What is wanted

A zero-dependency package, strings in and strings out, with four subpaths that each cost
only themselves:

| Subpath | Gives you | Ceiling (U5) |
| :-- | :-- | :-- |
| `./policy` | `outputMode(runtime)` → `tty \| pipe \| json \| accessible \| ci`, decided once from `Runtime`. The only place in the stack that reads `isTTY`, `NO_COLOR`, `FORCE_COLOR`, `CI`, `CLI_ACCESSIBLE` | `node:util` alone |
| `./tokens` | semantic styles — `error`, `hint`, `command`, `flag`, `muted`, `ok` — over `util.styleText`, silent under any mode but `tty` | picocolors: 3.3 KB, +10 ms |
| `./theme` | a token → style map, overridable once for a whole CLI; contrast-checked with `burgee/contrast` **only** when the theme emits truecolor or 256-colour | — |
| `./chalk` | chalk's chainable API over `styleText`, graded by chalk's own test suite like `burgee/commander` is by commander's | chalk: 16.7 KB, +18 ms |

`burgee`'s help renderer does not import this. It keeps its own four `styleText` calls and
exposes a theme seam this package can fill (U1).

## Why now

- **Colour libraries decide the terminal each on their own and disagree** (clack #286), give
  you `red` when your program means `error`, and none has a theme. That is the standalone
  problem, and it is chalk's, not burgee's.
- U2 has no home in this repo either. The `NO_COLOR` logic sits inside `commander-command.ts` today, and
  `cli-help-renderer`, `caique` and `flagstaff` each need the same answer. Three
  copies is how the incumbents ended up disagreeing (clack #286).
- Chalk gives you `red`; the help renderer, errors and prompts need `error`. Without a
  shared vocabulary each renders its own idea of an error and a theme cannot change them
  together — yargs #1699, colour in a command name breaking matching, is what happens when
  colour is applied to data instead of to a token at render time.
- The chalk façade is cheap and it is the on-ramp: chalk's public API is a few dozen
  chained getters plus `level`. One import changes, tests do not.

## Affected users and systems

- New `packages/roundel`, published as `roundel` (candidate); intent and package share the name.
  Its own README, docs section and benchmark page against chalk and picocolors (U12).
- `cli-help-renderer` gains a `theme` render option typed structurally, no import.
- `commander-command.ts` colour detection moves here or is deleted in favour of it, with
  the compat pass rate unchanged.
- `compat-oracle` vendors chalk's suite as a third graded host; its pass rate is reported
  the way commander's is.
- `cli-benchmarks` B4 gains a per-subpath row for this package.

## Constraints

1. **Conditional weight is a lock, not a convention.** `sideEffects: false`, no barrel
   entry with side effects, and a test that reads each `dist/` subpath and asserts it has
   no relative import other than `./policy`. Importing `./tokens` never loads `./chalk`.
   Tree-shaking is proven, not assumed: the B4 R7 fixture importing `{ red }` from the root
   entry bundles to the same bytes as `./tokens` (U10).
2. **Both module systems from one artifact.** ESM with a `default` condition per entry, no
   top-level await, so `require('<pkg>/chalk')` works via `require(esm)` — a CJS chalk
   user changes one `require`, exactly as a CJS commander user does (K2).
3. **Ceilings from U5 are gates.** The chalk façade fails CI above picocolors' spawn delta
   or chalk's bytes; `./tokens` fails above picocolors' bytes. Baselines recorded in
   `.sdlc/bands/` and ratcheted like the tarball size.
4. Nothing reads `process.*`; everything reads a `Runtime`-shaped argument (T1). The
   process-reference lock extends to this package.
5. Under `json`, `pipe`, `accessible` and `ci` modes, every token returns its input
   unchanged. Under `tty` it styles. No third behaviour.
6. Contrast checking is honest: the 16-colour palette is the user's terminal theme and is
   never checked or claimed.
7. Zero external runtime dependencies (U6); this package depends on nothing at all, since it
   is the bottom of the stack. Node ≥ 24, ESM with a `default` condition (K2).

## Success criteria

- Four subpaths, each installing and importing from the tarball in one file (U7).
- chalk's suite vendored and graded; the pass rate is published and ratchets.
- Per-subpath benchmark rows on `/benchmarks` with the picocolors and chalk ceilings
  drawn on them.
- The subpath-isolation test fails when a cross-import is added, proven by adding one.
- `cli-help-renderer` renders byte-identical help with and without a theme installed in
  non-TTY mode.

## Open questions

- **Does `./policy` stay here or become its own package?** Deferred to `design.md`. The
  test is whether `flagstaff` peering on `roundel` for one function is acceptable, or
  whether a package of one function is the smaller evil.
- **`chalk.level` and `chalkStderr`.** Chalk's global mutable level and its per-stream
  instance are the two places its model and U2 disagree. The façade has to honour both to
  pass chalk's tests; how that maps onto one policy is a design decision.
