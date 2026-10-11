---
"compat-oracle": patch
---

The oracle runs type-only suites. A host may declare `runner: 'tsd'`: its suite's own pinned `tsd` compiles the vendored files against the shim's declarations, and each assertion it recognises (`expectType`, `expectAssignable`, `expectError`, …) is one case, failing when an error falls inside it. An error outside every assertion — an `@ts-expect-error` that found nothing, an import the target lacks — is one more failure, never dropped. A file is never one case. The run is refused when the suite does not pin tsd in `suiteDeps` or has no `tsconfig.json` of its own, because tsd would otherwise resolve both by walking up the directory tree.
