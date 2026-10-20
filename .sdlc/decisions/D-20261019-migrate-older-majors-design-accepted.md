---
id: D-20261019-migrate-older-majors-design-accepted
subject: 'migrate-older-majors: is the Stage 2 design accepted for Build?'
taken: 'Accepted — by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-19'
date: '2026-10-19'
superseded_by: —
---

**Accepted. [`migrate-older-majors/spec.md`](../intents/migrate-older-majors/spec.md), as
re-grounded on `main` at `326907eca6`, is the design Build implements, and the intent moves
`draft → approved`.** Accepted by the coordinator under the owner's delegation
(burgee-owner-delegates-tradeoffs): the owner delegated Design→Build accepts on 2026-10-12, and the
agent that builds the change does not approve it.

**The design.** For a commander or yargs project on a major the drop-in does not claim,
`burgee migrate` reports a work list and, where nothing is in its way, a move:

- R1: each file `package.json` `bin` names is read, so an extensionless `bin/qrcode` is scanned
  (and, on a claimed major, rewritten);
- R2: `REMOVED_APIS`, seven rows, each cited to the incumbent's `CHANGELOG.md` at a pinned tag,
  with the line quoted;
- R3: a token walk finds each line that uses one, decided by evidence: a whole-module binding
  used for a member the façade does not export, a two-letter short flag in a commander flags
  string, `commander/esm.mjs`, yargs' removed instance methods;
- R4: each `offMajor` row gains `sites`, `nearest` (the smallest claimed major above the one
  found) and `move` (each imported specifier with its entry at `nearest`);
- R5: nothing is rewritten, and the summary and text say what is in the way;
- R6: a lock holds every row's citation, and probes hold every row true of the drop-in at every
  claimed major, both ways;
- R7: a docs section;
- R8: the gate. A move is printed only to `nearest`, and only when no site's API was removed by
  then and every imported specifier has an entry there. A Quint model, `majors.qnt`, checks that a
  printed move never targets an entry that lacks an API the project uses, and that a move is
  printed whenever one is safe.

On the field trial's four crashes this means: wait-port, madge and tsc-alias get the line that
breaks and no move (each uses an API commander 14 already removed); qrcode gets its singleton line
and the move `yargs -> burgee/yargs/v17`, because 17 still has the singleton.

**Alternatives the design rejects:**

- a lint rule as the only home (the intent rejected it);
- applying the move, which would be a rewrite graded at another major (D-145);
- moving to the current entry, as the trial did by hand (`stepLatest`);
- `nearest` without a gate, which invites the crash;
- a move for incumbents with no table, such as chalk 4, whose removals nothing checks;
- citing "`storeOptionsAsProperties` removed in commander 13", which commander's changelog does
  not say;
- one site per member use;
- detecting excess-argument and duplicate-flag errors by token scan;
- no Quint model.

**Cost accepted.**

- The move is checked against seven APIs and graded at `nearest`, not at the project's major.
  The incumbent's own non-crashing changes between the two remain the maintainer's to read; the
  docs say so.
- `.reset(` in a file that imports yargs is reported whatever its receiver. That errs toward
  refusing a move, never toward printing one that crashes.
- A bin with no extension on a claimed major is now rewritten, which it was not before.
- It ships as a `minor` for `burgee`, held by the release window.
