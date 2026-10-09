---
id: D-20261009-positioning-density-reported
subject: 'Is incumbent mentions per 100 words a gate, or a reading'
taken: Taken
date: '2026-10-09'
superseded_by: —
---

**A reading, not a gate.** `scripts/positioning-audit.ts` reports mentions per hundred words for
every front page, and nothing fails on it. The gate is the opening: the first paragraph after
the hero names no incumbent (`scripts/positioning-lock.test.ts`).

**Why.** A comparison page and a migration section name the incumbent because that is their
subject, and the compatibility table names it because that is the proof. A word budget would
lower the count by rewording proof, which is the opposite of the intent. The opening is where a
reader or a model takes its definition from, so the opening is what is held.
