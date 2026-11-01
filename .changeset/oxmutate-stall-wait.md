---
"oxmutate": minor
---

A mutant that leaves its test waiting on an idle worker is now a Timeout at its budget, as Stryker scores it. This changes verdicts. Such a test waits on something the mutant never lets happen, such as a prompt awaiting a keypress: its worker's event loop still turns and its server burns almost no CPU. Before, the watchdog re-ran it with 3x the budget, and it came out Killed only when the test's own timeout (Vitest's, 30 s in burgee) fell inside that window. On caique that was about 375 mutants. Those verdicts move from Killed to Timeout, and the mutation score does not change, because a Timeout counts as detected. A stop whose worker was busy, a loop or a slow test on a loaded machine, keeps its re-run at 3x. The watchdog tells the two apart from a heartbeat the test worker writes and from the server's CPU time over the last second: idle is a live heartbeat and under 25% of a core (`.sdlc/decisions/D-20261101-idle-stall-is-timeout.md`, `.sdlc/intents/oxmutate/stall.qnt`).

The run's stats gain `staticMs`, the time spent deciding static mutants in live workers, and the summary line prints it. That time was missing before, so the phases now add up to the run. The stats also gain `idleStalls`. `OXMUTATE_DEBUG_WATCHDOG=1` prints each stop with its heartbeat age and CPU share.
