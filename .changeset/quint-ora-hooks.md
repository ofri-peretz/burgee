---
"flagstaff": patch
---

Two `ora` spinners on one stream, stopped in the order they started, leave `write` as they found it. The second used to restore the first's wrapper as its "original", so a stopped spinner stayed hooked into every later write and cleared lines it no longer owned.
