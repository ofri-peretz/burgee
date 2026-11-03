---
id: D-20261101-idle-stall-is-timeout
subject: 'oxmutate scores a mutant whose test waits on an idle worker Timeout at its budget, with no 3x re-run'
taken: 'Taken by the coordinator on the owner''s delegation of burgee trade-offs (2026-10-12), 2026-11-01, as option B of the SC8 work'
date: '2026-11-01'
superseded_by: —
---

**The decision.** When the watchdog stops an isolated run, it first reads what the run was doing.
If the test worker was inside a test body, its event loop was still turning, and the server used
under 25% of one core over the last second, the run is **idle**. Its verdict is Timeout at its budget, with no re-run. Any
other stop is **busy** and keeps today's path: one re-run at 3x the budget, then Timeout only if
that run is stopped too. Warm stops still send the mutant to an isolated run, as before.

**Why.** caique is a prompts library. A mutant that breaks keypress handling leaves the test
awaiting input that never comes. Measured on a 248-mutant caique subset (`inquirer-select.ts`,
`inquirer-keys.ts`) on 2026-11-01 with `OXMUTATE_DEBUG_WATCHDOG=1`, 18 of 19 stops read 0–2% CPU
with a live event loop. The one loop read 72% (`.sdlc/intents/oxmutate/sc8-profile.md`). No budget
cures that kind of wait. Before this decision, the 3x re-run outlasted Vitest's 30 s test timeout,
the test failed, and the mutant came out **Killed**. On caique's 10-31 weekly run that was the "375
timeout(s) that finished given 3x the time"; Stryker scored the same kind of mutant **Timeout**, 417
of them on 2026-10-24. So the Killed verdict was an artefact of one timeout outlasting another, not
evidence a test caught the mutant. It also cost at least 30 s a mutant: about 375 × 30 s, roughly
11,250 worker-seconds, or about 47 minutes of wall at concurrency 4, before the stop at 1x and its
server.

**What changes.** About 375–417 caique verdicts move from Killed to Timeout. That is the idle-stall
set, and only that set. The mutation score does not change, because a Timeout counts as detected
(`scoreOf` in `coordinator.ts`, `summarise` in `scripts/mutation.ts`). On the subset, every verdict
was identical except 5 Killed → Timeout, which were exactly the idle stops the old path had re-run
and "overturned".

**Inside a test body, not just idle.** The first build read only the heartbeat and the CPU. Under
load (average 33), the `stall` fixture's emptied-string mutant was stopped at its 1.5 s budget while
its worker still collected the test file, at 3% CPU, and was scored Timeout. A worker that is still
loading modules is a slow machine, which is what the 3x re-run is for. So the runner marks a test
body as running, the heartbeat carries the mark, and only a stop inside one can be idle.

**How it is held.** `heartbeat.ts` (the classifier and its thresholds) with `heartbeat.test.ts`.
`e2e.test.ts` checks both directions: the `stall` fixture's hung mutant is Timeout at its budget with
no re-run, and the `slow` fixture's busy loop keeps its 3x re-run and comes out Killed. Each test
was proven to fail on the build it guards against. `.sdlc/intents/oxmutate/stall.qnt`: a Timeout
from an idle stop is never re-run, a busy stop is re-run at most once, and only idle stalls past
the isolated budget change verdict.

**Limits.** A project run in Vitest's `forks` pool (burgee's) runs tests in a grandchild
process. The server's CPU time does not include it, so only the beat tells a loop from a wait
there. A loop that keeps its event loop turning (a `setImmediate` spin) reads idle under `forks`.

**Reversal.** If a mutant reported Timeout this way is later shown to be killed by a test within
3x its budget on an unloaded machine, the classifier is wrong for it. Raise the evidence bar (CPU
window, threshold) or restore the re-run, and record a new decision.
