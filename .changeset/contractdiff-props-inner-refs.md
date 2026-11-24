---
"contractdiff": patch
---

`props` reads a payload on its own when one of its `$ref`s points inside it (such as
`#/properties/b`), as it did before definitions were shared; only references to the contract's
definitions go through the shared reader.
