---
"compat-oracle": patch
---

twist's end-to-end suite stays skipped on Windows, now for twist's own reason: twist 0.0.5 loads each file with `import()` of a `D:\` path, which Windows refuses. The tsd and uvu suites run there.
