# Decisions

**Every decision in this repository is closed in `.sdlc/decisions/`, one file per decision,
with the answer and the date.** A decision that lives only in a chat log cannot be reviewed,
diffed, or replayed by the next agent — that is rule 1 of `CLAUDE.md` one level above this
repo, and a question carried at the end of a message violates it exactly as much as a design
does.

This file exists because 102 open questions had accumulated across 48 intents with no
mechanism that could ever close one. An intent's `## Open questions` section is where a
question is *raised*. `.sdlc/decisions/` is where it *ends*; this file is the policy that
governs it, and holds no decisions itself.

`scripts/decisions-lock.test.ts` is what makes that a mechanism rather than a sentence. It
checks: the repo-wide open-question count stays at or under the ceiling in
`.sdlc/bands/open-questions.json`; no decision is half-written; no id is used twice; every
`superseded_by` names a decision that exists; every file in `.sdlc/decisions/` is read as a
decision, so none is skipped silently; every sequential id D-001..D-151, and D-161, D-163 and
D-164, is still there; no new id continues that sequence; and this file holds no decision rows. It does **not** verify that
a question closed here was struck from the intent that raised it — that is step 3 below and it
is on the author, because matching a decision to a prose bullet is a guess and a gate that
guesses is worse than none.

## Where a decision is written

One file, `.sdlc/decisions/<id>.md`, named for its id:

```markdown
---
id: D-20260927-per-entry-ledgers
subject: Where a decision is recorded, and how it is numbered
taken: Taken
date: '2026-09-27'
superseded_by: —
---

**The answer, in bold first**, then the reason — the same prose the table's Answer column held.
```

`npm run ledger -- new decision <slug>` writes that file with today's date and every field
empty, so it fails the lock until it is filled in. `npm run ledger -- decisions` prints the
whole ledger as one table.

**Ids.** D-001 to D-151 were numbered in sequence and keep those names forever — commits,
specs, READMEs and PR titles cite them, and `.sdlc/decisions/D-102.md` is where `D-102`
resolves. D-161, D-163 and D-164 were written on main while the change below was in flight
and keep their names too; they are the only sequential ids past D-151. The sequence stopped
on 2026-09-27 ([D-20260927-per-entry-ledgers](./decisions/D-20260927-per-entry-ledgers.md)): two branches
that each take "the next number" take the same one, and every such pair was a rebase, a
renumber and another CI run. A new id is **`D-YYYYMMDD-slug`** — the date it was taken and a
few words saying what it is. Two branches collide only by picking the same slug on the same
day, and then git refuses the second as an add/add conflict rather than merging two decisions
under one name. Cite it in full in a commit subject: `(D-20260927-per-entry-ledgers)`.

There is no generated table committed beside the files, on purpose: an index every decision
PR regenerates is one file every decision PR edits in the same place, which is the conflict
this layout removes.

## Who decides

**The default is to decide.** An agent working in this repository takes the decision, writes
it down in `.sdlc/decisions/`, and continues. It does not end a message with a question it
could have answered. Four kinds go to the owner and nothing else does:

| Escalate | Because |
| :--- | :--- |
| A **published claim** changing — a number or promise on a README, the docs site, or npm | It is a promise to people outside the repo, and retracting one costs more than making it |
| A **band or ceiling** moving in the loosening direction | Ratchets exist so growth is a decision; an agent raising its own ceiling is the failure the ratchet was built to catch |
| A **package's identity** — what it is for, what it refuses to be | caique not wrapping clack is the reason caique exists; that is not an implementation detail |
| **Money, publishing, or anything outward-facing** — npm, a metered API, an upstream PR | Irreversible, and not the agent's to spend or say |

Everything else is taken. A tie is broken by: the option the tree can already prove, then
the smaller diff, then the one that is easier to reverse. If a decision later turns out
wrong, it is reversed with the reason — which is cheaper than every session re-deriving
the same answer and cheaper still than never deciding.

**Taken** in a decision's `taken` field means the agent decided and it stands. **Accepted**
means the owner did. An escalated decision carries `Owner` there and a default in its answer,
and the default is what happens until the owner says otherwise — a question with no answer is
a decision to do nothing, made slowly.

## How a question gets closed

1. It is raised in the intent that owns it, under `## Open questions`.
2. It is answered in a new file under `.sdlc/decisions/` — a subject, an answer, a date, and
   whether it was **taken** by an agent or **accepted** by the owner.
3. It is struck from the intent's `## Open questions`, because it is no longer one.

## How a decision gets reversed

A closed decision's answer is never edited. Reversal is a **new decision** with the new
answer, and the old file's `superseded_by` set to the new id — the one field of an old
decision that ever changes — so the ledger reads as a history rather than a current state, and
`git log` is not the only place the change survives. An em dash means nothing reverses it. The
lock checks the reference resolves; it cannot check the reasoning, which is the author's.

`npm run decisions` lists every question still open across every intent, so the count can
only go down deliberately. A question that has been open for two weeks is a decision nobody
is making, which is itself a decision — made slowly, and by default.
