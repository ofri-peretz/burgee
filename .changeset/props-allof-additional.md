---
'contractdiff': patch
---

`props` reports `additionalProperties` inside an `allOf` when it sits behind a `$ref`, so values it makes there are kept only where the validator accepts them, instead of failing agreement.
