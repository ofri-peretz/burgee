---
"flagstaff": patch
---

`hoist()` puts the cursor back when a signal ends the process. `close()` restored it, and
`close()` does not run for a signal with no listener — so Ctrl+C during a frame left the
terminal with no cursor at all. The loop now shares the `cursor.js` both façades use.
