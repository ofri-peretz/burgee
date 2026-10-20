---
id: D-20261020-schema-group-design-accepted
subject: 'declaration-summaries and schema-bytes-gated: are the Stage 2 designs accepted for Build?'
taken: 'Accepted — by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-20'
date: '2026-10-20'
superseded_by: —
---

**Accepted. [`declaration-summaries/spec.md`](../intents/declaration-summaries/spec.md) (R1–R4) and
[`schema-bytes-gated/spec.md`](../intents/schema-bytes-gated/spec.md) (R1–R3), each as re-grounded
on `main` at `326907ec`, are the designs Build implements, and both intents move
`review → approved`.** Accepted by the coordinator under the owner's delegation
(burgee-owner-delegates-tradeoffs): the owner delegated Design→Build accepts on 2026-10-12, and the
agent that builds the change does not approve it. The third intent of the batch,
`schema-is-validated`, was already `approved` (D-129) and needs no accept here.

**declaration-summaries.** A published declaration keeps each JSDoc block's first paragraph and the
`@param`, `@returns`, `@throws`, `@example`, `@deprecated`, `@default` and `@see` tags, and drops
the rest of the prose (D-20261012-declarations-carry-summaries). The rule is one function over
TypeScript's comment scanner, called from `strip-comments.mjs` by every package's build:

- R1, measure first, with the kill switch at 5% of burgee's gzipped pack;
- R2, the rule in the build;
- R3, a lock over every published package's packed declarations;
- R4, the tarball baselines follow the packs down.

Re-grounding changed these, each listed in the spec's *Re-grounded* section: three kinds of
non-JSDoc comment are kept whole (a `///` directive, a `@ts-` pragma, a licence notice); a fenced
code block is not prose and is kept; R3's red-on-main count is read from the built declarations
instead of the source; R4 lands in the same PR; the generated API reference pages follow the
built declarations; and the build scripts join turbo's `globalDependencies`.

**schema-bytes-gated.** `SCHEMA_BYTES_BUDGET` in `benchmarks/axes/reliability.ts`, set by
D-20261012-schema-bytes-budget to the demo's `--schema` measured on the day it lands, rounded up to
50 B. burgee's `schema-bytes` record carries `gate: { max: SCHEMA_BYTES_BUDGET, why }`, and gap
`B-20261012-agent-schema-bytes-no-gate` closes. Re-grounding fixed the record's unit: it counted
UTF-16 code units and was labelled bytes, so it now counts UTF-8 bytes, as `skill-bytes` does.

**Alternatives the specs reject:** stripping every comment (hover text gone); shortening the source
comments (they are the design record); an api-extractor bundle (a new dependency); widening the
`agent-schema-bytes` control band (it would measure nothing afterwards); a budget with headroom.

**Cost accepted.** An editor's hover over a family export shows the summary and the rendered tags,
no longer the design essay below them. The essay stays in the source.
