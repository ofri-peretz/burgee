---
'flagstaff': patch
---

`register()` lists a plugin name once instead of accumulating it — every other contribution already landed in a `Map`, so re-registering replaced entries while the name list grew, and `flagstaff check` and the docs gallery both project that list.
