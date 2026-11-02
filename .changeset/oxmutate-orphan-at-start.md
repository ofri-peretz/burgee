---
"oxmutate": patch
---

A Vitest server whose run is killed while it is still loading Vitest now exits at once. Before, it listened for its coordinator going away only after Vitest had loaded, and on a busy machine that takes seconds. A server whose coordinator was already gone before it started also exits now.
