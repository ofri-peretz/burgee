# Intent — `burgee/commander` bundles no heavier than it has to, and every byte over commander is named

> Stage 1 artifact. Opened on the owner's direction of 2026-10-12: _we must win on the trade-off
> of value, performance, scale and robustness, and own the size-versus-value judgement._ The
> product's flagship front-end does not meet U5 in a user's bundle.

**Status:** approved · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

---

## What is wanted

`burgee/commander` puts in a user's start-up bundle only what a run can reach synchronously.
Whatever answers with a Promise anyway loads on demand, behind a `dynamic-import` edge a bundler
splits off. Every byte that is still over commander is attributed to a module and to the
synchronous contract that keeps it there, and a downward-only ratchet holds the number where the
work leaves it.

The target is commander's own **39,329 B**. If that can't be reached without giving up a contract,
the target is the closest measured point, and the gap is a table of named bytes with a recorded
decision behind it.

## Why now

- **The measurement.** `/docs/weight` (`npm run weight:page`; `esbuild --bundle --minify
  --format=esm --platform=node --splitting`, initial load only) prices `export * from
  'burgee/commander'` at **61,207 B**. The same method over commander 15.0.0 plus
  `@commander-js/extra-typings`, which is `export * from 'commander'`, gives **39,329 B**. That's
  **1.556×**, or 21,878 B over. U5 ("a drop-in weighs no more than the incumbent it replaces")
  doesn't hold for the front-end the product is named for.
- **On disk it is the other way round.** The static walk in `packages/burgee/src/weight.test.ts`
  reads `./commander` at 115,356 B against commander's 126,392 B. So the excess is what a bundler
  pulls in that a file count doesn't show. `spec.md` attributes it by module from the metafile.
- **The last word on this is a year of raises.** `benchmarks/axes/weight.ts` carries eleven
  dated raises of `burgee/commander`'s bundled ceiling, from 59,157 to 61,100. D-102 (2026-09-21)
  called the residual structural because the spawn "cannot go lazy". Measured today, it can, on
  every path but one. See `spec.md` R1.
- **Two lanes are about to add to it.** #1039 (extra-typings) and `facade-projection-fidelity`
  both write in `packages/burgee/src/commander*`. A ratchet set now holds them to this number.

## Affected users and systems

- `packages/burgee/src/commander/command.ts` and a new `commander/surfaces.ts`. Nothing in
  burgee's core or in `bellpull` changes.
- Everyone who bundles a commander-syntax program built on burgee. Their bundle shrinks, and their
  program behaves the same.
- The published numbers that move: `/docs/weight`'s `burgee/commander` and
  `burgee/commander/extra-typings` rows, `BUNDLED_CEILING['burgee/commander']` in
  `benchmarks/axes/weight.ts`, the `lighter-than-commander` claim ratchet in
  `.sdlc/bands/claim-ratchets.json`, and the README gates generated from them.

## Constraints

- **Grades never fall.** commander stays at 1360 / 1360 and extra-typings at 369 / 369 (if #1039
  is on `main`), measured with `npm run compat -- commander --control`.
- **`parse()` stays synchronous.** `commander/sync.test.ts` and commander's own suite assert on
  it. Anything a synchronous `parse()` answers (`--schema`, `--json`, the E1 floor, `use()`'s
  refusal) stays in the static graph. `spec.md` says why for each one, from the code.
- **No start-up regression.** The B2 cold-start ratio and the static weight lock for
  `./commander` may only fall.
- **Ratchets only move down.** Each PR measures, then tightens to the measurement. No PR raises a
  ceiling.
- **Zero dependencies, 100% coverage, the generated files regenerated and committed.**

## Success criteria

1. `burgee/commander` bundles at or below 39,329 B. If it doesn't, it bundles at the floor this
   intent measures (55,633 B by the prototype in `spec.md`), and every byte between that and
   39,329 is named in `spec.md`'s residual table, which sums to the measurement.
2. `scripts/subpath-weight-lock.test.ts` holds `burgee/commander` and
   `burgee/commander/extra-typings` as `OVER_INCUMBENT` rows at the new measurement, and
   `BUNDLED_CEILING` and `lighter-than-commander` are lowered to match.
3. `scripts/commander-front-end-lock.test.ts` fails if a `bellpull` module, a completions or MCP
   module, or the façade's `surfaces` module enters `burgee/commander`'s initial load.
4. commander 1360 / 1360 and extra-typings 369 / 369 by `--control`. B2 holds.

## Open questions

- Whether `--schema` may answer after `parse()` returns. **Answered in `spec.md`
  (_Rejected alternatives_): no.** `parse()` returns after `--schema` is served, and the
  program's own code runs next. A program that calls `process.exit()` or `help()` there would
  exit before a lazily loaded schema printed. That is the 5,725 B line of the residual.
- Whether `use()` may defer the plugin check. **Answered in `spec.md`: no.** A refused plugin
  must throw where it is registered, and that is the 4,262 B line.
- Whether the residual is acceptable as a published floor or a feature has to go. **Decided
  2026-10-12 →
  [`D-20261012-commander-front-end-floor`](../../decisions/D-20261012-commander-front-end-floor.md)**:
  every surface stays, the floor is published byte for byte, and the ratchet only moves down
  (D-157's rule).
