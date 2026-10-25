---
id: D-20261025-commander-env-design-accepted
subject: 'commander-env: is the re-grounded design, narrowed to V2 (env names in --schema) and K3 (discovery order in --explain), accepted for Build?'
taken: 'Accepted — by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-25'
date: '2026-10-25'
superseded_by: —
---

**Accepted, narrowed. [`commander-env/spec.md`](../intents/commander-env/spec.md) § Design gate
2026-10-25 is the design Build implements, and the intent moves `review → approved`.** The
`withEnv` design was superseded by `seniority` and the native engine, as the 2026-10-18
restatement records. Five pieces were open, and this gate rules on each.

- **V2, env names in `--schema`: kept.** `schema.ts` passes `env` through, but no test asserts
  it. One lock, proven red by removing the field.
- **K3, the discovery order in `--explain`: kept.** Constraint 3 promised that the file
  discovery order is itself explainable. Today `config explain` prints the precedence `ORDER`,
  and `--explain` names only the winning file. `seniority`'s `candidates()`
  (`packages/seniority/src/config.ts`) already returns the discovery order with the reason each
  path is tried, so this only renders data the layer already has.
- **C3b, provenance-task turns against commander: measured at this gate, and held as a reading.**
  Over the 71 CI readings in `benchmarks/results/agent-cli-bench/*-ci.json` dated 2026-10-08 to
  2026-10-18, the `diagnose-provenance` task's median turns are 5 for burgee against 11 for
  commander. The per-reading ratio has median 0.500 (range 0.385–1.222), and it is below 1 in 68
  of 71 readings. It is reported, not gated, because B1 per task is too noisy to gate.
- **C1, a case per cited issue that fails on plain commander: dropped.** The cited issues are
  yargs issues. Plain commander has no API for most of them (env scoping, provenance,
  `extends`), so "fails on commander" is true by absence and measures nothing. The 9 cases that
  exist are the claims the code makes. The other 16 issues are cited on the docs research page as
  demand, not as fixes, so no public claim rests on a missing case. The same ruling covers
  `commander-schema` C1 ([D-20261025-commander-schema-dropped](./D-20261025-commander-schema-dropped.md)).
- **R3, `--explain` on the façades: dropped.** `facade-gets-more` declined it in its out of
  scope, and a façade's contract is its incumbent's API. A program that wants `--explain` gets it
  on the native surface, one import away.

**Build scope, one batch:** the V2 lock, and K3's discovery order in `config explain` and
`--explain`, each proven red first.
