---
id: D-20261025-agent-headroom-design-accepted
subject: 'agent-headroom: is the re-grounded design, narrowed to R3 (row budget), R6 (hint lock), RF (registered formats with tsv) and C1 (large-demo figure), accepted for Build?'
taken: 'Accepted — by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-25'
date: '2026-10-25'
superseded_by: —
---

**Accepted, narrowed. [`agent-headroom/spec.md`](../intents/agent-headroom/spec.md) § Design gate
2026-10-25 is the design Build implements, and the intent moves `review → approved`.** R5
(`--format=ndjson`) and R2's dotted result paths are dropped from this intent. Accepted by the
coordinator under the owner's delegation of 2026-10-12; the agent that builds it does not approve it.

**What re-grounding found, on `main` at `c92e4173f4`.** R1 holds (`machine-json.test.ts`). R2,
R4 and N15 shipped as `burgee` N14, N13 and N15. R7 holds as restated: `schema-bytes` is banded,
`recovery-bytes` is reported. C4 is reported (164 B against commander's 31 B, because burgee's
failures carry a `hint`, a `fix` and the command's usage). Six pieces were never built: R2's
dotted paths, R3 `--max-bytes`, R5 NDJSON, R6's hint-survival lock, RF (`formats` on the
plugin object), and C1's large-demo 40% with the pretty figure beside it.

**Kept, each on value against bytes:**

- **R6, the hint-survival lock.** It costs no shipped bytes. It holds the one constraint this
  intent puts above every byte count: a failure's `hint` survives `--json=<fields>` and
  `--format=agent`.
- **RF, `formats` on the plugin object, with `tsv` as the first registered format.** It is the
  one measured win left: 63% fewer bytes than minified JSON on fifty rows of four fields. It is
  also the extension surface PRINCIPLES 7 and 14 ask for, and the owner asked for it ("support
  any format that will provide value"). The formats ship as data through `plugin-contract`.
- **R3, narrowed to a row budget.** A list result over `--max-bytes N` is cut at a whole row,
  stays valid JSON, and carries `truncated: { of, returned }`. No continuation token: a framework
  cannot paginate a handler it did not write, so the next step is the command's own arguments.
  This is D-062's budget on any machine format, with nothing promised that the engine cannot keep.
- **C1, the large-demo figure.** One test over `examples/demo-cli-large`'s schema, plus the pretty
  byte count reported beside the compact one. Constraint 5 asked for the figure before the change
  to be kept beside the figure after.

**Dropped:**

- **R5, `--format=ndjson`.** The spec's own rule: it lands "only if a command with a large result
  set exists … a format with no caller is a format that rots". None exists. NDJSON measured 0%
  smaller than minified JSON, and once RF lands an author who wants it registers it as one format.
- **R2's dotted result paths.** No caller has asked for them. `--json=<a,b>` selects top-level
  fields, `--schema … --field <path>` drills into the schema, and `--format=agent` drops the envelope.

**Cost accepted.** RF and R3 add bytes to burgee's root entry, and the per-entry weight
ratchet in `packages/burgee/src/weight.test.ts` gates them. If the ratchet does not hold, the
build re-converges it on purpose (`npm run weight:converge`) and states the delta in the PR.
It never raises the budget silently.

**Build scope, one batch:** R6 lock, RF (`formats` key, `--format=tsv`, `--format` lists what is
registered), R3 row budget, and the C1 test plus the pretty figure.
