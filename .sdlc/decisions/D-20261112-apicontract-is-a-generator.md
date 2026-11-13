---
id: D-20261112-apicontract-is-a-generator
subject: 'apicontract: is the product the contract commands (diff, explain, check) or the generator?'
taken: Taken
date: '2026-11-12'
superseded_by: —
---

**The generator, in both directions. `apicontract` is a CLI that turns a team's specs into generated
code and their code back into specs, and every generator and extractor is a plugin.** In the owner's words, 2026-11-11: "a CLI that help engineering teams to
convert specs into generated code, JS/TS validators, etc. extendable we will build 'extensions' or
plugins for it to generate different types of code, like nestjs modules", and "if someone wants to
convert spec to js/ts validator or json schema (ajv) our cli will allow them to do so". And on
2026-11-12: "for both directions also code to specs".

The intent had opened on 2026-11-06 with "one contract tool for every API in your repo" and led with
`diff` and `explain`. The review of 2026-11-11 read the product from that text and recommended
parking the plugin API and the NestJS generator; that recommendation is withdrawn
([`review.md`](../intents/apicontract/review.md) § Correction).

What changed in [`roadmap.md`](../intents/apicontract/roadmap.md): phases 1 to 4 are the generators
(types and the plugin API; validators, ours or JSON Schema for ajv; NestJS modules and the plugin
kit; more stacks), and code → spec lands in the same phases from Phase 2, with the round trip
verified. `explain` + `diff`, MCP and code-first, `check`, the remaining protocols and
`lint` follow as phases 5 to 9. The intent's statement, personas and success criteria, the spec's
package table and the metrics follow it; the plugin API, JSON Schema output and the NestJS generator
gained leading and lagging metrics.

**Not decided, and assumed as follows until the owner says otherwise:**

- `explain`, `diff`, `check` and `lint` are kept as later phases, not dropped.
- No plugin of ours emits Zod. Whether a third party's may is not ruled.

**Revisit:** if the plugin eval (X3) fails at the Phase 3 exit, or if a generator's named competitor
cannot be beaten on a metric.
