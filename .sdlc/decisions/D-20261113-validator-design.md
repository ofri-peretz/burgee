---
id: D-20261113-validator-design
subject: 'validator: which engine, and the three questions its intent left open'
taken: Taken
date: '2026-11-13'
superseded_by: —
---

**A schema is data, read three ways: interpreted with no `eval` by default, emitted as straight-line
code ahead of time, and written out as JSON Schema.** The reason is a measurement, in
[`spec.md`](../intents/validator/spec.md): on the intent's bench schema, two different no-`eval`
engines both reach about 4.4M validations a second (3.4 times Zod, a third of ajv), and straight-line
code written as a generator would write it reaches 22M (1.7 times ajv). Read on a loaded machine, so
the ratios are the finding, not the absolutes.

So the latency claim against ajv is made for generated validators, and hand-written schemas claim
Zod. A just-in-time door through `new Function` is opt-in, on its own subpath, for servers that
allow it.

The intent's three open questions close with it:

- **The drop-in subset** is whatever share of Zod's own suite the Zod-shaped façade passes, published
  as a number, at the design's build step 8. No subset is promised before it is measured.
- **Against `apicontract`'s phases:** the engine and the emitter (build steps 1 to 3) land before
  `apicontract`'s Phase 2, which generates them.
- **No Quint model:** nothing in it has state or ordering. That changes if async refinement or
  streaming comes into scope.

Taken by the agent under the owner's go-ahead of the same day
([`D-20261113-apicontract-build-go-ahead`](./D-20261113-apicontract-build-go-ahead.md)); each is a
default the owner can reverse.
