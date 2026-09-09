# Intent — A burgee any project can fly: brand colours in, a full mark set out

> Stage 1 artifact of the AI-native SDLC. Opened from wiring burgee's own mark on
> 2026-09-07: one shape had to be hand-carried into four surfaces, and the interlace
> repo already runs a shell script to stop the same duplication drifting.

**Status:** draft · **Opened:** 2026-09-07 · **Owner:** @ofri-peretz

---

## What is wanted

A brand declared once — two colours and, optionally, a glyph — becomes every identity
surface a project ships, emitted by an algorithm rather than drawn by hand.

```js
defineBurgee({ lead: '#f4794a', follow: '#0d9460', dark: { … } })
```

and out come the favicon SVG, the raster set, the 1200×630 OG card, and the monochrome
and light/dark variants, each one a projection of the same declaration — the pattern
this repo already applies to commands, applied to identity.

Concretely, once this lands:

1. burgee's own `apps/docs/src/app/icon.svg` and `opengraph-image.tsx` are **generated**,
   not hand-maintained, and a check fails if a committed asset no longer matches its
   declaration.
2. A project that has never heard of Interlace passes two hex colours and gets a mark
   that is legible at 16px and correct in both themes.
3. The Interlace mark geometry stays **locked**: the generator derives the flag from the
   −30° bar construction, and cannot redraw it.
4. Output is byte-stable — the same declaration produces the same bytes, so assets can be
   committed, diffed and reviewed like code.

## Why now

Measured on this repo today, not felt:

- The burgee shape is now hand-copied into **three** files — `burgee-mark.tsx`
  (`BURGEE_PATHS`), `icon.svg`, and `opengraph-image.tsx` — with a comment as the only
  thing holding them together. Two of the three have no check that would catch drift.
- The sibling `interlace` repo already pays this tax: `devtools/scripts/sync-favicon.sh`
  exists solely to copy one SVG into its consumers.
- Verifying that the flattened paths matched the previous `clipPath` construction took a
  157,839-sample script written for the occasion and thrown away. That is exactly the
  work an algorithm should own.
- Every CLI that adopts burgee ships a docs site, and every docs site needs a favicon and
  an OG card. The surface is not incidental to the product; it is the product's own
  first adopter.

## Affected users and systems

`apps/docs` (favicon, OG card, nav and hero marks), the locked geometry in
`brand-mark.tsx` / `burgee-mark.tsx`, the `interlace` repo's `brand-assets/` and
`sync-favicon.sh`, and any downstream CLI that adopts burgee and wants a mark of its own.

## Constraints

- **It does not enter the core import.** The repo's outranking constraint is that burgee
  stays a library you import in one file. This ships behind a subpath or a separate
  package; `import { defineCommand } from 'burgee'` gains nothing and costs nothing.
- **No new runtime dependency to emit SVG**, and no headless browser. SVG is text.
- **Rasterisation is opt-in**, since PNG/WebP/AVIF need a rasteriser the SVG path does not.
- **Deterministic.** Same declaration, byte-identical output, no timestamps, no ids.
- **The Interlace geometry is locked**, and this intent does not reopen it.

## Success criteria

- `icon.svg` and the OG card in `apps/docs` are generated; a CI check fails on drift, and
  the check is proven to fail on the unfixed state.
- A two-colour declaration from an unrelated brand renders legibly at 16, 32 and 512px in
  both themes.
- Two runs of the generator produce identical bytes.
- The core `burgee` entry point's install size and cold start are unchanged.

## Verified against `main` — 2026-09-09

Checked criterion by criterion on `61bd11b9`. **One of four met, one half.** `draft` is the
honest status and it is already what this file says — but note that a `burgee brand` command,
six generated surfaces and a `brand:check` script all shipped *before* this intent has a
`design.md`, so the Design→Build gate was skipped here. It cannot move to `approved` until that
design exists; that is the lock working, not an obstacle to route around.

`npm run brand:check` exits 0: `brand: 6 surfaces and the mark component match the declaration`.

- **`icon.svg` and the OG card are generated, a CI check fails on drift, and the check is proven
  to fail on the unfixed state** — **not met, on all three clauses.** `apps/docs/src/app/icon.svg`
  *is* generated (`scripts/brand.mts:67`), as are five files under `brand-assets/`. The **OG card
  is not**: `apps/docs/src/app/opengraph-image.tsx` is hand-written JSX and is not in the
  `surfaces` array — only `brand-assets/burgee-og.svg` is. There is **no CI check**:
  `brand:check` appears only inside the `lint` npm script, and no workflow runs `npm run lint`
  (`quality.yml` runs `npx eslint` directly; lefthook pre-push runs typecheck, test and build).
  Drift is caught only if a human types the command. And **nothing proves the check fails on the
  unfixed state** — no test exercises `brand.mts --check` against drifted content.
- **A two-colour declaration from an unrelated brand renders legibly at 16, 32 and 512 px in both
  themes** — **not met, and it currently cannot be run.** The exact unrelated pair this repo's own
  tests use (`#5b21b6` / `#0ea5e9`, `brand.test.ts:163`) fails the CLI's contrast gate and emits
  nothing: `error: contrast below WCAG AA … 2.20:1 (needs 3:1)`. The documented escape hatch does
  not work either — `--allow-low-contrast` is declared at `packages/burgee/src/cli.ts:100` and
  gated at line 141, but a **kebab-case boolean option is never populated by the parser**, so the
  error message names a flag that cannot be set. No test asserts legibility at any size, in
  either theme, for any brand; `brand.test.ts` covers burgee's own pair's contrast only.
- **Two runs of the generator produce identical bytes** — **met.** Two `burgee brand` runs a
  second apart diff clean across all six files, backed by `brand.test.ts:109` ("is deterministic
  — same declaration, same bytes") and `:126` ("emits no timestamps and no randomness").
- **The core `burgee` entry point's install size and cold start are unchanged** — half. Install
  size is locked: `weight.test.ts:80` pins `'.'` at 52,000 B and `'./contrast'` explicitly denies
  `brand.js`. **Cold start is not measured anywhere** — there is no spawn benchmark in the repo.

## Open questions

- **Does this belong in this repo at all?** It shares the "one declaration, many
  projections" thesis, but nothing else — not argv, not the manifest. `interlace` is the
  other candidate home. This is the question to settle before any design.
- What does "provide your logo image" mean concretely — is a supplied glyph *embedded* in
  the flag field, or does the generator only ever emit the two-tone field? Embedding a
  raster into an SVG that must stay legible at 16px is a different problem from
  colouring a locked shape.
- Should the generator itself be a burgee CLI? It would be the honest dogfood — a real
  command, served through `--json`, `--schema` and `--mcp` like any other.
- Which raster formats actually earn their place, and against which rasteriser.
