---
id: D-20261025-plugin-contract-design-accepted
subject: 'plugin-contract: is the re-grounded Stage 2 design, with R9 (one check runs every installed layer), accepted for Build?'
taken: 'Accepted — by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-25'
date: '2026-10-25'
superseded_by: —
---

**Accepted. [`plugin-contract/spec.md`](../intents/plugin-contract/spec.md), as re-grounded on
`main` at `b453b07b`, is the design Build implements, and the intent moves `review → approved`.**
Accepted by the coordinator under the owner's delegation (burgee-owner-delegates-tradeoffs): the
owner delegated Design→Build accepts on 2026-10-12, and the agent that builds the change does not
approve it.

**What re-grounding found.** Of the spec's nine requirements (R1–R8 and R5a), all are built and locked on `main`,
R7 once restated: one object into ten hosts (`plugin-contract-lock`), one schema byte-identical in ten
packages (`plugin-schema-lock`), no layer importing another (each package's `weight.test.ts`),
`tokens` in roundel, `widgets` in caique, every layer hosting or saying why (R5a), one contract
version, one error vocabulary (`plugin-error-vocabulary-lock`). The intent's criteria lag behind:

- **C3, "one command runs every installed layer's validation"**, is the gap. Nine `check`
  commands exist, and `burgee check` reads burgee's keys only. An object carrying `tokens` alone
  is refused by it as `E_NO_CONTRIBUTION`: "contributes nothing burgee reads".
- **C2, "renders in all five modes"**, holds per layer (`flagstaff check` prints tty, pipe, ci,
  json and accessible) but nothing runs the one example through every layer's check from one
  command.
- **R7, "data first"**, is false as written: R5a's hosts take functions (`read`, `run`,
  `handler`, `static`). Restated to the rule the family schema enforces.
- **C4, the weekly eval**, passed 10 of 10 plugin cases on 2026-10-08 and 2026-10-09; the
  readings of 2026-10-15 and 2026-10-22 are `not-run` (usage limit). It stays open until a
  weekly reading lands.

**The design accepted for C3, spec R9.** `burgee check <file>` hands each key another layer hosts to that
layer's own installed `check`, found as `node_modules/<host>` at or above the plugin's
directory, run as a child process with the same file, and reports each layer's keys, command,
exit code and output. A layer that is not installed is named with the command to run. A layer
that refuses refuses the whole check, with its own code, message and fix. Data-only routing: a
table of key → host, held to the family schema by a lock.

**Alternatives rejected.**

- *Import each layer's `check` in-process.* No layer exports `./check`, and a static import
  would make burgee depend on nine packages (R3; PRINCIPLES 8, each package an independent
  product). A dynamic import of a computed specifier is a specifier nobody reviewed.
- *Name the layers and run nothing.* Cheaper, and C3 stays unmet: the author still runs nine
  commands to learn one verdict.
- *A `register()` in burgee that forwards to the others.* Already rejected by the spec: it would
  require every layer installed, turning ten products into one framework.
- *Drop C3.* The eval cases and the docs page both tell an author to run nine commands; the
  family's headline (one object, every layer) has no single verdict without it.

**No Quint model.** The new behaviour holds no state: each layer's check is independent,
read-only, and the report follows the plugin's key order. Registration order and conflict
resolution (last plugin wins) are each host's, shipped and tested there before this intent.

**Cost accepted.** `check.js` is loaded only by `burgee check`, so `.` and every façade entry pay
nothing. A check of a plugin that reaches installed layers spawns one Node process per layer.
