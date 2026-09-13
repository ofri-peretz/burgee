# The eight layers, one page each — measured 2026-09-13

> Every package this family ships is a layer with its own incumbents. This is the per-layer
> answer to four questions: **what the incumbents do**, **what their users cannot get from
> them**, **where we stand against their own suites**, and **whether the layer owes an
> extension surface**. Regenerate the inputs with `npm run compat`,
> `scripts/fetch-competitor-issues.sh` and `scripts/foundation-baseline.ts`.

## Plan and design coverage — one gap, and it is the flagship

| package | intent | design | status |
| :-- | :--: | :--: | :-- |
| **burgee** | **—** | **—** | **no intent directory** |
| roundel | ✓ | ✓ | approved |
| flagstaff | ✓ | ✓ | approved |
| caique | ✓ | ✓ | review |
| linegauge | ✓ | ✓ | draft |
| closeout | ✓ | ✓ | draft |
| seniority | ✓ | ✓ | draft |
| bellpull | ✓ | ✓ | draft |

`burgee` is the only one with no package-level intent. Its work lives in capability intents —
`replacement-parser`, `commander-compat`, `yargs-compat`, `cli-packaging`, `cli-mcp`,
`commander-schema` — so nothing states what the engine layer *is*, what it replaces, or where
it stops. Every other package has that artifact. **This is the first gap to close**, because
the other seven are graded against a written layer definition and the flagship is not.

## Reading the issue evidence — open counts lie for four of these incumbents

`chalk`, `ora`, `log-update` and `listr2` **close feature requests by policy**. Their open
counts are structurally zero and say nothing about demand; the demand is in the `not_planned`
pile, which `fetch-competitor-issues.sh` already snapshots for exactly those four. Counting
only open issues reads "nobody asked" where the truth is "everybody was declined".

Chalk is the case in point. Zero open issues, and among its seventeen declined:

- **Feature Proposal: Semantic Theming / Profile Support** — `not_planned`
- **Implement Custom Color Presets** — closed duplicate
- **seven separate requests for a CommonJS build**, all declined

So a colour layer does owe a theme surface, and the evidence for it was never going to appear
in an open-issue count.

## The eight

| layer | replaces | open | declined-extension | graded | extension surface |
| :-- | :-- | --: | --: | :-- | :-- |
| **burgee** | commander, yargs, oclif, citty, cac, meow | **329** | — | commander 1360/1360 · yargs 804/804 | **has one** (plugins as data, schema) |
| **roundel** | chalk, picocolors | 8 | **2** | chalk 58/58 | **owed** — themes/presets, twice declined upstream |
| **flagstaff** | ora, log-update, boxen, cli-table3, listr2, ink | 32 | 0 | ora 99 · log-update 99 · boxen 84 · cli-table3 29 | **has one** (plugin contract + schema) |
| **caique** | inquirer, clack | **68** | — | none yet | **likely** — widget/renderer registry |
| **linegauge** | string-width, wrap-ansi, strip-ansi, slice-ansi, cli-truncate, widest-line, wcwidth | 4 | 0 | string-width **201/229** | **narrow** — a width-override hook |
| **closeout** | signal-exit, exit-hook, cli-cursor, onetime | 7 | 0 | none yet | no |
| **seniority** | cosmiconfig, lilconfig, rc, dotenv, c12 | **55** | — | none yet | **owed** — loader/format interface, 3 open requests |
| **bellpull** | execa, tinyexec, which, npm-run-path | 18 | 0 | none yet | no |

`caique`'s 68 is `clack` 60 + `inquirer` 8 — the largest open count outside the engine, and it
has no graded row at all yet.

## Next three, per layer

1. **burgee** — write the missing `intent.md` + `design.md`. Then the engine's own gap:
   `--schema` still emits `schemaVersion: 1` and drops `relations`, and nothing asserts any
   surface *fails on plain commander*, which is the claim that makes a switch worth making.
2. **roundel** — a theme/preset surface as data (rule 7), seeded from chalk's two declined
   threads rather than from evangelism. Its `chalk` row is already 58/58, so parity is done
   and this is the reason-to-switch half.
3. **flagstaff** — the contract exists; `plugin-contract` is 1 of 4 and the lock finds
   `caique` and `burgee` "not applicable" rather than failing them. Make it grade something.
4. **caique** — a vendored suite. It is the second-largest pool of user pain in the family and
   carries no graded number; `inquirer` and `clack` are both recorded as blocked because a
   façade matching their drawing snapshots *would be* the incumbent, so grade what is not
   drawing: the decide table and prompt semantics.
5. **linegauge** — 28 failures left against `string-width` (11 Hangul jamo, 12 emoji
   presentation, 3 spacing marks, 3 prepended concatenation marks), then `wrap-ansi` active,
   then `strip-ansi` and `slice-ansi`.
6. **closeout** — extract `flagstaff/src/cursor.ts` (114 lines, already written), and make
   `onExit` return its own unsubscribe, which answers `signal-exit`'s top open issue.
7. **seniority** — the largest prize (`cosmiconfig` alone is 17 packages and 1.9 MiB) and the
   clearest owed surface. `burgee/src/precedence.ts` already types `Provenance`, `Candidate`
   and `Resolution` — the `.explain` half nothing in the ecosystem has.
8. **bellpull** — `tinyexec` settled the weight pitch (1 package, 26 KiB vs `execa`'s 18 and
   632 KiB). Build on resolution and result shape or not at all.

## What is not yet measured

`caique`, `closeout`, `seniority` and `bellpull` have **no graded row** — four of the thirteen
suites the foundation intent promises, plus caique's two, are unvendored. Until then "better"
in those layers is an argument, not a number.
