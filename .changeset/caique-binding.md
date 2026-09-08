---
"caique": patch
---

`resolvePrompts()` — the pass a framework calls from its `preAction` hook: walks a command's options in declaration order, asks only what has to be asked, and stops at the first refusal. One host-agnostic binding rather than one per host, so nothing in caique imports burgee.
