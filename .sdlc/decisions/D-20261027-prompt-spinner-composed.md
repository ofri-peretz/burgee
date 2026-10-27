---
id: D-20261027-prompt-spinner-composed
subject: 'flagstaff criterion 8: does a plugin''s spinner reach a caique prompt through a caique → flagstaff dependency, or through the program that has both?'
taken: 'Through the program: caique''s spinner takes a spinner style as data, and caique does not depend on flagstaff. Decided under the owner''s delegation of trade-offs.'
date: '2026-10-27'
superseded_by: —
---

**caique does not gain a dependency on flagstaff. `caique/clack`'s `spinner()` takes a `style` —
`{ frames, interval, static }`, flagstaff's `SpinnerDef` shape, typed structurally — and a program
that has both hands one to the other: `spinner({ style: lookupSpinner('harbor') })`.** On a
terminal the style's frames turn at its interval; anywhere else its `static` is printed where the
first frame would be (U3), which the old `frames` option could not say. burgee composes nothing
either: it depends on neither package. The composition lives in the program, and the family
documents it on its own side (`scripts/plugin-surfaces.test.ts`), which is where Principle 8 puts
family integration.

**The question.** flagstaff's criterion 8 asks for one plugin, registered once, to show up in help,
in a prompt's spinner and as `--json` events, one case per surface. The 2026-10-26 sweep found no
path for the second: caique does not depend on flagstaff, so nothing a program registers with
flagstaff reaches a caique prompt. Two ways to give it one.

| | caique → flagstaff dependency | the program composes them (taken) |
| :-- | :-- | :-- |
| What a caique install carries | flagstaff on top: **+236,669 B unpacked** (`npm view flagstaff dist.unpackedSize`, 1.7.5). flagstaff's own dependencies (closeout, linegauge, paratext, roundel) are already caique's, so flagstaff alone is the cost: about **+80%** on caique's 289,980 B | nothing: `style` is a type and three reads of a field |
| What it buys | `spinner({ style: 'harbor' })` by name, looked up for the caller | the caller writes the lookup: `lookupSpinner('harbor')`, one call it already has |
| Principle 2 (arrows one way) | allowed: flagstaff is in-family and has no edge back to caique | not engaged |
| Principle 8 (installs and works alone) | caique still works alone, at nearly twice the install | caique works alone at its current weight; a program with both gets the composition |
| Plugins as data | the registry is read by caique | the plugin's entry *is* the data caique reads; no registry is needed to read it |
| The installed band in `comparison.mdx` (±2%) | breached by an order of magnitude, for four glyphs | unmoved beyond the option's own bytes |

A prompt package that requires the animation package to draw four frames is the weight trade the
family exists to refuse. caique's spec already rejected the import once ("Importing flagstaff for
them would make the one package that talks to a human the only one in the family that requires a
sibling", 2026-09-08); that sentence is stale about siblings — caique now depends on five — but
its reason about weight stands, and is now measured.

**What holds criterion 8, and what does not yet.** The three cases are
`scripts/plugin-surfaces.test.ts`: help through `HelpOptions.theme` with roundel's tokens (the
seam shipped in burgee's help R7), the spinner through `style`, and `--json` through `ctx.json`,
which burgee hands a handler from this change on so flagstaff's `hoist` can take its `json` mode
(the policy's own words: "the engine's knowledge, not the process's"). The `style` option and
`ctx.json` ship in the next caique and burgee minors; until npm serves them, the criterion is held
on `main` only, and flagstaff is not stamped `shipped`.

**Rejected:** `caique` hosting a `spinners` key in its own registry. It would be the same data
validated twice, by two packages, with two refusal paths for a missing `static` — the drift
`plugin-schema-agreement.test.ts` exists to catch — and it would still not be "registered once".
