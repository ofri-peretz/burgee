---
id: D-20261027-controlroom-dashboard-wizard-marks
subject: 'controlroom criterion 1 names four tabs and the wizard''s ◼ ▶ ◻ marks; the reference dashboard had two tabs and flagstaff''s ✔, a blank and a spinner. What does the demo grow, and how?'
taken: 'Taken by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-27, in feat/controlroom-close'
date: '2026-10-27'
superseded_by: —
---

**The dashboard has the wizard's four tabs — Status, Tail logs, Visualizer, HN — and registers
its marks as a flagstaff plugin: `◼` done, `◻` pending, and a `step` spinner whose frames are
`▶ ▷`, so the running step pulses. The Visualizer tab draws the run as a progress bar and is
`liveOnly`; the HN tab is one line that says it is the app's own.**

The umbrella sweep of 2026-10-26 read criterion 1 as "the demo exists" and listed only the Gallery
entry and the 20-run check as open. Reading the criterion against the demo found two more gaps:
it names "four tabs with a generated key-hint line" and "a right checklist with `◼ ▶ ◻`", and the
demo had `Status · Tail logs` and flagstaff's default glyphs. Both are cheap to close and the
criterion is literal, so they close here rather than as a note.

**Why a plugin, not a change to flagstaff.** flagstaff's defaults (`✔`, a blank pending mark)
are the family's, and `tasks.ts`'s pending mark was made replaceable precisely so a program could
choose `◻` (controlroom R3). The boilerplate choosing its marks through `register()` is the
extension surface working as designed, and a reader who deletes the plugin gets flagstaff's own.
The pipe transcript prints `◼ <step>` for a finished step, the glyph a plugin chose; a screen
reader reads the glyph the program registered, as it would any other.

**Why the Visualizer is `liveOnly`.** Its bar is the status line's count drawn as cells. Off a
terminal it would print the same number twice per step under a second label. The status pane
keeps the count in every mode, so nothing a pipe reads is lost (R6's "tabs do not hide content"
is about content, and this is a drawing of content already printed).

**Why HN is a placeholder.** The wizard's Visualizer and HN content is application content and
out of scope (intent, Out of scope). The tab exists so the layout, the tab bar and the hint line
are the wizard's; its pane says it is the reader's to fill, and prints in every mode.

**The layout's learn column** is `{ fr: 1, min: 30 }` (it was `min: 20`): at 80 columns the
fractional share was 26 cells, the learn text is 27, and the checklist abutted it with no gap.
