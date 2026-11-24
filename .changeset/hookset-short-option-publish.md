---
"hookset": patch
---

guard-bash asks before `pnpm -F pkg publish`: a single-dash option can take the next word as its value, the same as `--filter pkg`, so the publish after it is found.
