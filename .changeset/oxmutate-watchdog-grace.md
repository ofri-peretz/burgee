---
"oxmutate": patch
---

A warm run that passes its budget while its worker is blocked, not looping (under half a core: a synchronous child process, or module loading on a loaded machine), now gets the 3x its re-run would have had in place, instead of a server kill, a restart and that re-run. Loops are still stopped at the budget, waits inside a test are still a Timeout, and no test is waited on past 5 s. The summary counts these as `watchdog: N blocked run(s) given 3x their budget in place`.
