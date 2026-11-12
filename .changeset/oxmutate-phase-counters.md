---
'oxmutate': patch
---

The run's stats say what the warm and isolated phases were made of. `warmUnitMs` is the warm servers' time and `warmArmedMs` the part of it inside test runs; the rest is starting workers, collecting files, canaries and hooks. `isolatedByCause` counts what sent each mutant to an isolated run: a static fallback, a watchdog stop, unfinished work, a re-run at 3x, a survivor's confirmation, or a flaky test. The summary prints both, for a phase that ran.
