---
"closeout": patch
---

`runSync` arriving while an asynchronous shutdown is still parked reports the handlers that never came back, and leaves that report on `registry.report`. Before, it answered `{ timedOut: false, unfinished: [] }` of its own and left `report` unset, so a lock still held in `flush` read as a shutdown that had finished cleanly.
