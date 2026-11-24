---
'oxmutate': patch
---

A `.ts` file holding `-->` in a template literal (an HTML comment marker) now instruments. The safety-net reparse of the instrumented code used the path's Unambiguous source type, which lexes `-->` as an HTML comment and then rejects it in a module; it now reparses as the kind the source resolved to.
