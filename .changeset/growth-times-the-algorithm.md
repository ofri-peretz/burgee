---
'burgee': patch
---

The cliui growth gate times the call under test, not the construction of its input, and reports
its working when it fails.

`growth((n) => cliui({width:80}).div(' '.repeat(n)+'x'))` built a fresh string and a fresh
`cliui` inside every one of `repeats` timed iterations. That makes the reading partly a
measurement of the allocator under whatever heap pressure the machine is under, not of how the
algorithm grows — the 4n batch produces four times the garbage, so a runner that collects
during it and not during the n batch reports superlinear growth for perfectly linear code.
Both inputs are now built once, outside every timed region.

**This is an improvement to the instrument, not a proven fix for the CI failure.** The gate
read 23.9 against a ceiling of 8 on all three CI platforms while reading 3.5–4.5 locally, and
that could not be reproduced here: 15 consecutive runs green, and green again under a 64 MB
heap with four CPUs deliberately saturated — where the *old* estimator also passed. So the
cause is still environmental and unidentified.

Which is why the reading now carries its working: `ratio 4.09 — 31.33 ms at 4n against 7.66 ms
at n, batched 1024x`. The batch size is the diagnostic — it is how much averaging the
calibration decided the machine needed, and a reading taken at `repeats: 1` is a single call's
luck rather than a measurement. If this fails on CI again it will say something useful instead
of accusing linear code of being quadratic.

Still catches the regression it exists for: restoring the upstream `str.replace(/ +$/, '')`
reads 14.28.
