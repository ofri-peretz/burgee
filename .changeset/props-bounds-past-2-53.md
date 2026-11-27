---
'contractdiff': patch
---

`contractdiff props` breaks a `minimum` or `maximum` at 2^53 and above with a number that is
really past the bound. One past such a bound rounds back onto it, so the agreement property
reported the validator wrong for accepting a value that was in range (seen on the weekly corpus
run: jirafe, spectrocoin and three more documents).
