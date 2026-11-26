---
"replz": minor
---

`replz compare` runs a folder of inputs through the base ref and the head and fails on every output that changed, after `normalize` patterns remove noise, unless a person approved that exact change (by both outputs' digests) with a reason in `approved`.
