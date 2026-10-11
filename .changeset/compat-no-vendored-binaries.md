---
"compat-oracle": patch
---

The vendor step never copies a compiled executable. A file whose content is ELF, Mach-O or PE (magic bytes, never the name) is removed from the vendored suite and recorded under `omitted` in `.source.json` and in `PROVENANCE`; a lock fails if one appears under `vendor/`. execa 10.1.0's `test/fixtures/fast-exit-darwin` and `fast-exit-linux` leave the tree, and `write to fast-exit subprocess`, the one case that runs them, is excluded for ours and the control alike. An exclusion can now declare where the suite `registers` its case, so a machine that never registers it is not refused. execa reads control 1179 / 1179 and `bellpull` 0 / 1179 on every machine (was 1180 on ubuntu).
