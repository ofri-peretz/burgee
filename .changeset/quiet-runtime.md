---
"roundel": minor
"flagstaff": minor
---

A quiet runtime. roundel's `Runtime` gains an optional `quiet` field, and flagstaff draws nothing when it is `true`: no spinner, no progress, no status line, and the frame clock never armed. Data and errors stay the caller's to print and are never quieted. burgee's global `--quiet` sets it.
