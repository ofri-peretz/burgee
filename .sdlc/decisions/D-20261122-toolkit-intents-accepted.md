---
id: D-20261122-toolkit-intents-accepted
subject: 'Are the rulehome and contractdiff-compat-depth intents accepted, and the two open scope calls settled?'
taken: Taken
date: '2026-11-22'
superseded_by: —
---

**Accepted, and both scope calls settled.** The owner, 2026-11-22: "Accept both", then "stop asking
me." The designs for [`rulehome`](../intents/rulehome/) and
[`contractdiff-compat-depth`](../intents/contractdiff-compat-depth/) are written and approved with
them.

**Every product CLI is a burgee program; the foundation packages are exempt.** roundel, linegauge,
closeout, seniority and bellpull are what burgee is built from and cannot depend on it; paratext,
caique, flagstaff and controlroom are zero-dependency packages of the same layer. Their small CLIs
stay as they are. Every other CLI (apicontract/contractdiff, oxmutate, compat-oracle, rulehome, and
any new one) is a burgee declaration. Decided under the owner's delegation; reversible.

**The validator keeps its working name** until the owner names it. It is not published while the name
`validator` shadows validator.js on npm; the rename is one commit when the name comes.

Build order: rulehome steps 1–3 (import, TS, burgee) now; its `intent` delegation after #1707 merges.
contractdiff-compat-depth R4 → R2 → R1 → R3 → R6, with R7 after `lint` and R5 after the protobuf
reader.
