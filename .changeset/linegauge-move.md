---
'linegauge': minor
'flagstaff': patch
---

`linegauge` is real: `width` and `wrap` move out of `flagstaff` into the foundation
package that was reserved for them (F1, the move only). The default export is `width`,
call-compatible with `string-width`'s default. `flagstaff` imports them and deletes both
files; its 227 tests pass unchanged, and B4's bundled bytes are identical to the byte —
the code went to a different file, not away.
