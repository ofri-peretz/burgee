---
"oxmutate": minor
---

In container mode the default worker count is every core of the container but one, with no cap of eight
(13 on a 14-core Docker VM, where the host default stays 8). The container's cores are its own, and a
worker the kernel kills for memory is run again alone, so a neighbour's crash is no longer a verdict.
`--concurrency` and the config's `concurrency` still win.
