---
id: D-20261018-drop-control-band-agent-schema-bytes
subject: 'control-band-agent-schema-bytes: the step was accepted conformance work and the series is flat, so the breach intent is dropped'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs, applied by the roadmap-to-shipped program of 2026-10-18'
date: '2026-10-18'
superseded_by: —
---

**Dropped. The breach was a step, the step was accepted requirements, and the band has re-centred on it.**

The watcher opened this intent on 2026-10-12 at **4,752 B**, four of five readings above a
3,516 B mean. D-20261012-agent-schema-bytes-step-change answered both of its questions. The
growth from 1,678 to 4,752 B came in four steps, and each one is a conformance requirement the
owner accepted. The last is `a2e4f98` (#1027), `--schema` as a clispec v0.3 document. It is not
a regression, a measurement change or a corpus change. The document says more.

**Evidence, 2026-10-18.** Every reading in the 20-point window in `benchmarks/results/cli-benchmarks/` is **4,752 B** (σ 0).
`detect()` over the stored history plus those results reports no breach.

**What covers it instead.** The band, still running, against a 4,752 B centre. Two more checks:
`machine-json.test.ts` holds the document compact, and schema-bytes-gated (wave 4 #3) is the
intent that turns this series into a byte gate.

**How to reopen.** A "make the output readable" commit is what the band exists for. If one lands,
delete `.sdlc/intents/control-band-agent-schema-bytes/` so the watcher writes a fresh intent, or set
this one back to `draft`. While the directory exists, the watcher writes nothing
(gap A-20261018-dropped-band-intent-masks-breach).
