---
id: D-20261123-revendor-inquirer-prompts-8-8-1
subject: "@inquirer/prompts 8.8.1 was published on 2026-11-22 with ten prompt releases. What did the inquirer-prompts row and caique/inquirer/prompts need?"
taken: "Taken — a follow-on to D-20261123-revendor-inquirer-core-12-1-1, under the owner's standing autonomy (2026-11-23)"
date: "2026-11-23"
superseded_by: —
---

**Re-graded at the release tag, and level again.** `npx tsx scripts/vendor-suite.ts inquirer-prompts --version 8.8.1` took tag `@inquirer/prompts@8.8.1`, commit `6570b8e4`: eleven files, `tests +33/-1` by the vendor diff, and 294 cases once the `it.each` rows expand. Measured on linux x64, Node 24.13.0.

|                                             |    Before |     After |
| :------------------------------------------ | --------: | --------: |
| control                                     | 228 / 228 | 290 / 290 |
| `caique/inquirer/prompts`, at the re-vendor | 228 / 228 | 245 / 290 |
| `caique/inquirer/prompts`, ported           |           | 290 / 290 |

**Four more editor cases are excluded.** `displays custom validationError`, `keeps the process alive when a validate throw races EOF`, `keeps the user edits when validate throws` and `goes back to the default value when validate throws in clear mode` each answer through `editorAction` and count `editAsync` calls, the mock of a module caique does not import (D-20261011-inquirer-prompts-editor-mock). They are excluded by exact title, for both sides, beside the twelve already there: 294 cases less 4 is the 290.

**What was ported.** Read off the published 8.8.1 packages in the control's install. Each is held to a literal in `packages/caique/src/inquirer-release-8-8-1.test.ts`.

- The line and the screen agree after the prompt rewrites the answer. A refused answer is written back into readline's line in `expand`, `rawlist` and `search`, as `input`, `number` and `password` already did. An arrow pick in `rawlist` and `search` writes the shown key or term into the line, and at the edge the typed input goes back. `expand` empties the shown `h` when it opens its help.
- Keys typed while an async `validate` runs are dropped before the refused answer is written back (`input`, `number`, `password`). `search` gets a `validating` state that keeps the term and draws `loading`.
- `number` takes plain decimals only: `0x10`, `0b11`, `0o7`, `Infinity` and an overflowing `1e999` are refused, and `1e3` is still taken.
- `confirm` matches the whole keywords, then the built-in `y`/`n`/`yes`/`no`, before any prefix. Its hint takes each keyword's first grapheme (an emoji, an astral letter), and `confirmDefault` uppercases the whole text.
- `checkbox`: a digit on a disabled choice shows the disabled error, and the `a`/`i` shortcuts clear an error.
- `search`: a failed source empties the results and the cursor, names an error that has no message `Search failed`, and returns to idle so the next key searches again.
- `rawlist` matches a custom key as typed before trimming, and a `null` default preselects a `null` value.
- `input` tests a `pattern` with `search`, so a `g` or `y` pattern's `lastIndex` is left as its caller set it.
- The screen writes a Tab typed into an answer as a tab. `@inquirer/testing` 3.4.1 now delivers Tab as a byte, so readline puts it in the line. `linegauge/wrap` spreads tabs into spaces, and `wrapContent` now carries them through as NUL.

Two unit cases held the old arrow behaviour, a cleared line after an arrow in `rawlist` and `search`. They now hold the new one.

**Weight.** `./inquirer/prompts` measures 66,750 B against its 65,000 B budget (`packages/caique/src/weight.test.ts`). The budget is raised to 68,000 under the owner's delegation of budgets (D-20261020-caique-inquirer-prompts-budget). The growth is the code of the ports above, since `dist` carries no comments. `npm run weight:converge` moved caique's recorded weight from 304,657 to 306,493 B in `.sdlc/bands/foundation-ceilings.json`.

**Records.** The row's `suiteDeps` moved to what 8.8.1 asks for, each checked against `npm view`:

- `@inquirer/prompts@8.8.1` and `@inquirer/core@12.1.1`.
- The ten prompts: checkbox 5.3.1, confirm 6.4.1, editor 5.5.0, expand 5.2.1, input 5.2.1, number 4.3.1, password 5.3.1, rawlist 5.4.1, search 4.4.1 and select 5.3.1.
- testing 3.4.1, type 4.3.1 and external-editor 3.1.1.

`baseline/inquirer-prompts.json` reads 290 / 290. On `compatibility.mdx`, the row, the four new exclusions and the graded major were edited by hand, because the oracle graded only this host. `GRADED_VERSIONS` names 8.8.1.

**For the owner.** `caique` and `burgee` get `patch` changesets, because each change is the incumbent's own behaviour at a patch release (D-170).
