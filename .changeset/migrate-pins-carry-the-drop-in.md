---
"burgee": patch
---

`burgee migrate`: under a minimum release age, `next` never pins a family package below the first release that exports every subpath the rewrite imports. On svgo it printed `pnpm add roundel@^1.0.4` for three imports of `roundel/picocolors`, which first shipped in roundel 1.1.0, and the migrated CLI could not start. It now pins `roundel@^1.1.0`, and when no such release is old enough yet the note names the subpath and the date the first one that carries it can install. Each pin it moves for this reason carries `requires: { specifiers, since }`. The table of first versions is read from this repository's release tags at build time and ships in `dist/family-versions.json`; nothing new is fetched at run time.
