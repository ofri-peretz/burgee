# Design — published declarations carry summaries, not design essays

Intent: [`intent.md`](./intent.md). **Status:** shipped 2026-10-20 (all ten packages, Version PR #1184) — accepted by the coordinator under the
owner's delegation, [`D-20261020-schema-group-design-accepted`](../../decisions/D-20261020-schema-group-design-accepted.md), as re-grounded below.

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
  and fails if the step is reverted (for the packages whose saving exceeds the 10% allowance;
  R3 holds the rest — see *Re-grounded*).

## Design

A summariser over TypeScript's scanner, not a regex: comments are located by
`ts.getLeadingCommentRanges` on the emitted declaration, so a `*/` inside a string literal type
is never mistaken for an end. A paragraph ends at a blank comment line; a tag starts a tag
section that is kept whole. One function, used by every package's build through the existing
`strip-comments.mjs` call.

Order: R1, then R2 and R3 together, then R4 in the same PR (re-grounded: the release packs the
tree the PR builds, so waiting would record the same figure later).

## Verification

| R | Check | Red on main |
| :-- | :-- | :-- |
| R1, R2 | `scripts/declaration-summaries.test.ts` | no script |
| R3 | `scripts/declaration-summary-lock.test.ts` | multi-paragraph blocks ship |
| R4 | `npm run check:artifacts` | the old figure |

No state machine; no model.

## Rejected alternatives

- **Keep every non-JSDoc comment, or drop all of them.** Three kinds are not prose and stay
  whole: a `///` directive (it changes what a consumer's compiler loads), a `// @ts-…` pragma (it
  changes what that compiler reports), and a licence notice (`Copyright`, `@license`, `/*!`),
  which the MIT terms of the vendored declarations (`burgee/yargs`'s port of `@types/yargs`)
  require to travel with them. Every other non-JSDoc comment goes.

- **Strip every comment.** −18.8% gzipped, and hover text gone (the tarball decision refused it).
- **Shorten the source comments.** They are the repository's design record; the essays are the
  reason a reader can reconstruct a choice.
- **A `.d.ts` bundle (api-extractor).** A new external dependency, refused by the family's rule.

## Out of scope

- JavaScript comments, already stripped.
- The `locales/` packs (346 B of whitespace, measured in the tarball decision).

## Re-grounded 2026-10-20

Against `main` at `326907ec`:

- **R1's answer.** burgee saves **5.7% gzipped** (275,661 -> 260,048 B) and 4.3% unpacked, above
  the 5% kill switch, so R2–R4 proceed. The ten packages save 60,103 B gzipped (−7.9%) together;
  the per-package table is in
  [`D-20261020-declaration-summaries-tarball`](../../decisions/D-20261020-declaration-summaries-tarball.md).
- **R2: three comment kinds kept whole** — directives, `@ts-` pragmas and licence notices (see
  *Rejected alternatives*). Tags other than the seven are dropped with the prose, as the decision
  says (`@remarks`, `@internal`, `@constructor` occur in the built tree). **A fenced code block
  is not prose and is kept**, wherever it stands before the tags: the first build dropped
  `defineBurgee`'s usage example, which sits in an untagged later paragraph, and that is the
  part of a block a caller copies. A fenced block's blank lines and `@`-lines belong to the
  code. `.d.mts` and `.d.cts` are summarised too: closeout's
  `signal-exit` façade and burgee's `yargs/v17` ship one each.
- **R2: comments are located at every token,** `getLeadingCommentRanges` and
  `getTrailingCommentRanges` over the parsed file's full token list, not only at declarations,
  so a block before a closing brace with no declaration after it is reached too.
- **R3's red count, re-read from what ships.** The staged figure, 176 exported symbols in
  `packages/burgee/src/*.ts`, counted source. The built declarations carried **349** blocks with
  a second paragraph across the ten published packages on `326907ec`, **120** of them in burgee;
  the lock went red for all ten.
- **R4 lands in this PR,** not after the next release (see *Design*). Reverting the rule fails
  `check:artifacts` for bellpull, closeout, paratext and roundel, whose saving exceeds the 10%
  allowance; burgee's 5.7% does not, and R3 is the check that holds it.
- **The API reference follows.** `api-reference-lock` holds each site's reference to the built
  declarations, "as shipped", so the 66 generated pages under `apps/*/content/docs/api/` are
  regenerated and carry the summaries too. The essays stay in the source.
- **The build scripts join turbo's `globalDependencies`.** Turbo hashes a package's own files,
  and `strip-comments.mjs` lives in `scripts/`: a cached build replayed the essays after the rule
  changed. `schema-to-dist.mjs`, `family-versions.mjs`, `strip-comments.mjs`,
  `declaration-summaries.mts` and `declaration-reach.mts` are listed now.

## Build status

Built on `feat/schema-group` against `main` at `326907ec`. Every check below was red on `main`
first, and is green on the branch.

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | Built | `scripts/declaration-summaries.mts` (`measurePackage`, `--measure`) | `declaration-summaries.test.ts` › R1 (the fixture's delta is exactly the bytes the rule cut) |
| R2 | Built | `declaration-summaries.mts` (`summariseDeclaration`); `strip-comments.mjs` calls it | `declaration-summaries.test.ts` › R2 (14 cases, one a fast-check property: types unchanged, one paragraph left, idempotent) |
| R3 | Built | `scripts/declaration-summary-lock.test.ts` | red on `main` for all ten packages |
| R4 | Built | `.sdlc/bands/artifact-size-baseline.json`, D-20261020-declaration-summaries-tarball | `npm run check:artifacts` |

**Built: 4. Not built: 0.**

### Evidence against the intent's success criteria

| Criterion | Evidence |
| :-- | :-- |
| 1. a lock reads every packed `.d.ts` and finds no block with a second paragraph | `declaration-summary-lock.test.ts`, 10 / 10 packages green; red on `main` |
| 2. burgee's packed size falls; the figure is written into the baseline by decision | 275,661 -> 260,048 B gzipped; D-20261020-declaration-summaries-tarball |
| 3. `npm run compat -- extra-typings` stays 369 / 369 | 369 / 369 on the branch; commander 1360 / 1360, yargs 816 / 816, yargs-17 793 / 794 also unchanged |

Every built declaration (229 files) prints the same types with comments removed before and after
the rule, parses without a diagnostic, and is unchanged by a second pass.

**Open:** the smaller tarballs reach npm with the next release (a `patch` changeset for the ten
packages). The intent moves to `shipped` once that release is published.
