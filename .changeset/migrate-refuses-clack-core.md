---
'burgee': patch
---

`burgee migrate` now refuses a file that imports `@clack/prompts` and also imports, `import()`s or `require()`s `@clack/core`. Until now the file's prompts moved to `caique/clack` while its `updateSettings` from `@clack/core` kept configuring clack, which caique's prompts never read, and nothing said so. The refusal's reason is `sibling-state`, and it carries a `fix`: `import { updateSettings } from 'caique/clack' instead of '@clack/core', then re-run burgee migrate`. The file is left whole and the run exits 1. A type-only import of `@clack/core` does not refuse, and a file that imports `@clack/core` without `@clack/prompts` is left alone (D-20260930-migrate-refuses-clack-core).
