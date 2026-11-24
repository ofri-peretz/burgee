---
"hookset": patch
---

`hookset init` re-pins only the hookset remote's `ref:`; a repo that lists another remote first keeps that remote's pin. `hookset check` heads a failing result with every problem it lists, by severity (`hookset: 1 error, 2 warnings`), where it counted only the errors as `N problem(s)`.
