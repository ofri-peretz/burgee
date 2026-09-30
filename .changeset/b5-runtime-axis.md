---
"benchmarks": patch
---

B5, runtime against the incumbent: `npm run bench -- --axis runtime` times each entry point doing one realistic job against the package it replaces, in-process and interleaved, and gates every pair with a downward-only ratchet in `.sdlc/bands/runtime-ratchets.json` toward ≤ 1.0.
