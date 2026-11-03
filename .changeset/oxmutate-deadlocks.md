---
"oxmutate": minor
---

A test that can never resume is a Timeout in about half a second, decided by its own worker instead of the watchdog's clock.

Before, a promise nothing would settle, or input nobody would send, held its worker for the whole watchdog budget (10–12 s with `timeoutMS: 10000`), then cost a server respawn and often a 3× re-run. The worker now samples its own thread: its CPU, the other threads' CPU, Vitest calls in flight, pending timers (ref'd or not) and its native resources. When all of them stay quiet for the confirm window, the worker fails the test itself. A real timer, a child process, a socket or a busy loop is never called a deadlock.

On caique's three most hang-heavy files (964 mutants, back to back at comparable load):

- wall time: 1,308 s → 308 s
- watchdog stops: 398 → 15
- servers spawned: 405 → 22
- no mutant changed between detected and undetected

The status reason reads `its test deadlocked`, and `stats.deadlocks` counts them.
