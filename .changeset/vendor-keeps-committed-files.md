---
"compat-oracle": patch
---

A re-vendor keeps the files a host commits by hand. `Host.keep` lists paths under `vendor/<host>/` that no upstream release provides, and `vendor()` carries them from the directory it replaces across the staging swap. exit-hook keeps its unpacked incumbent under `node_modules/exit-hook/` and wrap-ansi keeps its `.gitignore` and `node_modules/`, which the re-vendor in #794 deleted.
