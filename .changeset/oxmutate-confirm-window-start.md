---
'oxmutate': patch
---

A deadlock is no longer called up to one sample (100 ms) before its confirm window has passed. The window opened at the start of the first quiet sample's span, which could begin before the wait was armed; it now opens no earlier than the wait itself.
