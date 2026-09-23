---
"burgee": patch
---

The README's "Start here" runs. The quickstart omitted `effects`, which `defineCommand` requires of every runnable command, so the first thing a new user pasted threw `command "greet" is runnable and declares no effects`; its `--json` line also left out the `meta` the envelope carries. The shape test now runs the snippet and its transcript straight from both READMEs instead of from a private copy.
