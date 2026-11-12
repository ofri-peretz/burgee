---
'oxmutate': patch
---

A mutant whose only failing tests failed by their own timeout is run once more before it is reported. On a loaded machine a slow test times out with no help from the mutant, and that was scored Killed: 8 of 15 static mutants on one file, by tests that clone repositories, all of which survive a quiet run. A second run that passes is Survived; one that is slow again is a Timeout with its reason; a failed assertion in either run is Killed, as before.
