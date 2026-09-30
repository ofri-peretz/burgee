---
"bellpull": patch
---

The `bellpull/node-which` façade reads the environment once per lookup, and builds each candidate path only as it tries it, rather than joining every `PATH` entry with every extension up front.

A hit in the first directory now costs one `stat`. In B5, `bellpull/node-which` ÷ which is 0.30× locally (0.43× on CI before this change).
