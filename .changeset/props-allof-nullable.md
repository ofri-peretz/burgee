---
'contractdiff': patch
---

`props` makes `null` under an OpenAPI 3.0 `allOf` only where every part lets it through: `nullable` belongs to its own part's `type`, so `nullable: true` beside a typed `$ref` no longer draws values the validator refuses.
