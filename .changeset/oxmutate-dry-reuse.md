---
"oxmutate": minor
---

`incremental` keeps each test file's dry run too (roadmap 3.3): a run dry-runs only the test files
whose module graph, mutants or Vitest config changed, and merges the rest from the incremental file.
One kept file in twenty is run anyway and must agree, or the whole dry run runs again. The summary
says how many test files were kept.
