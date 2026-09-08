---
"burgee": patch
---

`Runtime` gains `clock: { now(), schedule(fn, ms) }` (cli-output-stack R14), wired to `performance.now` and `setTimeout` in the process runtime and in the harness's fake, so a spinner or a benchmark can be driven by a test without waiting. Additive; `Clock` is exported from `burgee/testing`.
