---
id: D-20261025-output-stack-research-dropped
subject: 'output-stack-research: research complete — closed as dropped, with its one open item (caique''s evidence table) moved to caique'
taken: 'Taken — on the owner''s delegation of 2026-10-12, applied by the roadmap-to-shipped program (batch 28), 2026-10-25'
date: '2026-10-25'
superseded_by: —
---

**Dropped as a research-only intent whose research is done. Its one open item moves to the
intent that owns it.**

**Evidence that the research is done.** Every requirement (R1–R7) is held by a document on
`main`, per the 2026-10-18 restatement:

- the ten trackers are read in full, with declined issues included, by
  `scripts/fetch-competitor-issues.sh stack` and its snapshots;
- 21 clusters each name an owner, and a U-floor citations table gives every row a verdict, in
  `.sdlc/research/output-stack-open-issues.md`;
- the measured table of the ten incumbents is in `competitor-landscape.md` § 7;
- what could not be determined is recorded.

S1 and S2 hold. Both hypothesis rows (U9, U12) were since settled by measurement in the
umbrella's status table.

**The one open item, S3's caique half, is not research.** It is a `### Evidence` table in
`caique/spec.md`, keyed by caique's requirements and citing the research doc, of the shape
roundel's and flagstaff's designs already carry. That is an edit to caique's design, and it
belongs with caique's other open items. It is added there today as a named item, so it has an
owner and is not lost with this intent.

**Why drop rather than ship.** `shipped` would claim S3 met, and it is not. Holding a finished
research pass at `review` for one table in another intent's spec is a stale row, and a stale row
is read as work remaining.

**How to reopen.** A refresh of the research pass (for example after an incumbent's major
release) is a new intent. The research doc's two stale hypothesis cells are corrected in that
refresh.
