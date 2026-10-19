---
id: D-20261019-controlroom-scroll-pane-opens-at-tail
subject: 'Does a tall pane open at its first row or at its tail? (controlroom-scroll-pane R1 against S1)'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over trade-offs'
date: '2026-10-19'
superseded_by: —
---

**A pane opens pinned to its bottom, as `spec.md` R1 says: no scroll entry means `'end'`.**
The intent's first criterion reads "A 200-line pane in a 20-row rectangle shows rows 1–20.
PgDn shows 21–40", and the spec's R1 reads "A pane with no entry, or with `'end'`, is pinned to
its bottom". They disagree about the first frame, and only about that.

**Why R1.** The intent's own motivation is the log tail: "A pane at its bottom follows new
lines", and flagstaff's `log-tail.ts` hands the scrollable pane to controlroom for that. A tail
that opens at row 1 shows the oldest lines and stays there until someone presses End, and a
pane that starts empty and fills (a running build) would never follow. R1 is also the accepted
Stage 2 artifact, and the build was asked to implement the spec as written.

**How S1 is read, and checked.** S1 holds from Home: `scroll.top` shows rows 1–19 with `↓ 180`
in the 20th (the hint row, R4), PgDn shows 21–39 with `↓ 160`, End pins it again, and a new line
at the end is visible while pinned. `tabs.test.ts` and `compose.test.ts` assert each step, and
`screen.test.ts` drives the same keys through a live screen. The status table in `spec.md`
records the reading beside S1, so it is not hidden.

**Cost.** Before this change a tall pane on a live screen showed its first rows. It now shows
its last rows until the person scrolls. Those rows were unreachable before, so nothing that
worked stops working, but a program that put a long static text in a short pane will open on
its end. That is in the changeset.

**Rejected.** Opening at row 1 (S1 literally): a tail would have to be told to follow. A per-pane
`anchor` option: a new API surface for a choice nobody has asked to make.
