---
"provedone": minor
---

`intent check` reports `filter-count`: a shipped intent's evidence row whose command filters tests by name (`-t`, `--testNamePattern`, `--test-name-pattern`, `--grep`) must record an `N passed` count, because a filter that matches nothing exits 0 and the re-run would stay green after the test is renamed or deleted.
