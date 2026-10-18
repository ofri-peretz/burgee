# Design — published declarations carry summaries, not design essays

Intent: [`intent.md`](./intent.md). **Status:** review.

---

## Requirements

- **R1 — Measured before cut.** `scripts/declaration-summaries.mts --measure` prints, per
  package, the packed gzipped and unpacked bytes today and with the rule applied, from a copy of
  each built `dist/`. The result is written into this spec. If burgee's gzipped saving is under
  5%, the intent stops here and says so. *Check:* `scripts/declaration-summaries.test.ts` (new)
  runs it over a fixture with a three-paragraph block and asserts the measured delta; red on
  main, the script does not exist.
- **R2 — The rule, in the build.** `strip-comments.mjs`'s `.d.ts` branch keeps each JSDoc
  block's first paragraph and the listed tags, and drops later paragraphs and non-JSDoc
  comments. *Check:* the same test's fixture keeps `@param` and paragraph one, and drops
  paragraph two.
- **R3 — A lock over what ships.** `scripts/declaration-summary-lock.test.ts` (new) walks every
  package's packed declarations (`npm pack --dry-run --json` file list, built `dist/`) and fails
  on a JSDoc block with a second prose paragraph. *Check:* red on main: 176 exported symbols in
  `packages/burgee/src/*.ts` carry a JSDoc block with more than one prose paragraph (counted
  2026-10-12, first four files `agent-format.ts`, `agent.ts`, `argv.ts`, `as-typed.ts`), and the
  `.d.ts` rule keeps them all.
- **R4 — Baselines move down.** `artifact-size-baseline.json` re-recorded at the new packed
  sizes in a dated decision. *Check:* `npm run check:artifacts` passes with the lowered figure,
  and fails if the step is reverted.

## Design

A summariser over TypeScript's scanner, not a regex: comments are located by
`ts.getLeadingCommentRanges` on the emitted declaration, so a `*/` inside a string literal type
is never mistaken for an end. A paragraph ends at a blank comment line; a tag starts a tag
section that is kept whole. One function, used by every package's build through the existing
`strip-comments.mjs` call.

Order: R1, then R2 and R3 together, then R4 after the next release so the baseline reads what
npm serves (the rule the tarball decision used).

## Verification

| R | Check | Red on main |
| :-- | :-- | :-- |
| R1, R2 | `scripts/declaration-summaries.test.ts` | no script |
| R3 | `scripts/declaration-summary-lock.test.ts` | multi-paragraph blocks ship |
| R4 | `npm run check:artifacts` | the old figure |

No state machine; no model.

## Rejected alternatives

- **Strip every comment.** −18.8% gzipped, and hover text gone (the tarball decision refused it).
- **Shorten the source comments.** They are the repository's design record; the essays are the
  reason a reader can reconstruct a choice.
- **A `.d.ts` bundle (api-extractor).** A new external dependency, refused by the family's rule.

## Out of scope

- JavaScript comments, already stripped.
- The `locales/` packs (346 B of whitespace, measured in the tarball decision).
