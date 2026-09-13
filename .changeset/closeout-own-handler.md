---
'closeout': patch
---

A program that installed its own handler for a signal keeps it. `closeout` ran its cleanup
and then exited unconditionally, which overrules a program that asked to own SIGINT — one
that wants to finish a request and exit 7, or ignore Ctrl-C entirely. It now stands its own
listener down, and leaves only when no other listener remains. Cleanup is unchanged: it still
runs on every path, which is not what was being deferred.
