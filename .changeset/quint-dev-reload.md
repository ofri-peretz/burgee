---
"burgee": patch
---

`burgee dev` serialises reloads that pile up during one. Two saves landing while a reload was in flight both waited on the same link, then imported at once — and when the older import finished last, the server kept serving its stale commands. Each save now queues behind the one before it, so the newest save is the one served.
