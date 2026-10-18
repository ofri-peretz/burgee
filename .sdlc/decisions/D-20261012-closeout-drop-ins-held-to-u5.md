---
id: D-20261012-closeout-drop-ins-held-to-u5
subject: 'Is `closeout/exit-hook` and `closeout/signal-exit` held to U5 on its own, or does it carry the shared runner as product? (B-20261012-closeout-bundles-heavier-than-exit-hook, B-20261012-closeout-heavier-than-signal-exit)'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs'
date: '2026-10-12'
superseded_by: —
---

**Held to U5 on its own: each drop-in path must bundle at or under the incumbent it replaces.**
The phased registry, deadlines and the honest report stay closeout's product on its own entry;
the drop-in paths stop importing them. Both gaps asked for this decision and close when their
rows move to a ratio at or under 1.

**Why.** A drop-in is installed through an `overrides` line by someone who wants the incumbent's
behaviour and nothing else. `signal-exit` is 198,913,643 /wk (`replacement-map.md`); a user who
swaps it in and gets 1.272× the bundle has paid for a feature they did not ask for. Unlike
`burgee/commander` (D-20261012-commander-front-end-floor), nothing a caller of these two
packages calls answers from the registry's extra surface synchronously, so there is no
behaviour that forces the bytes to stay.

**What it costs.** The drop-ins share only `ambient.ts`'s one-per-process instance, so a
program that mixes `closeout` and `closeout/signal-exit` still runs every handler once. Whether
the lean path can share the registry's exactly-once guarantee without importing it is the
design's to prove: `spec.md` routes it to a Quint model.

**What the incumbent pays.** exit-hook 5.1.0 bundles to 1,645 B and signal-exit 4.1.0 to
2,856 B (`benchmarks/axes/weight.ts`, 2026-10-12).

**Reversal.** A new decision accepting a ratio above 1 as product, which keeps the two
ratchets where they are (2.98 and 1.31).
