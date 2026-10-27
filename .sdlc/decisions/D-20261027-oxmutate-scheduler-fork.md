---
id: D-20261027-oxmutate-scheduler-fork
subject: 'oxmutate forks its own Vitest servers instead of spawning through bellpull, and the inline-implementation ceiling moves 15 → 16 for it'
taken: Taken
date: '2026-10-27'
superseded_by: —
---

**oxmutate's scheduler (`packages/oxmutate/src/scheduler.ts`) forks its Vitest servers with
`node:child_process` itself, and `scripts/inline-implementation-lock.test.ts` moves its ceiling
from 15 to 16 to admit that one file. #1298 had lowered it from 18 to 15 the same day. The ceiling
only goes down; this raise is the owner's to accept or reverse.**

**Why the scheduler cannot use bellpull today.** A server is a long-lived child that stays up
across hundreds of work units. It talks to the coordinator over an IPC channel (`run`, `done`,
`close`). A watchdog stops it with `SIGKILL` when the progress file shows a mutant looping
synchronously, because no in-worker timeout or `cancelCurrentRun()` can interrupt such a loop
(measured 2026-10-26). A spare server is started ahead so a killed one is replaced without a cold
start. bellpull's `run` is one command and one result. It has no IPC channel and no handle to a
child that outlives the call. oxmutate's only other subprocess, `git diff` for the PR lane, does
go through bellpull (`src/lanes.ts`).

**The way back down.** bellpull gains a handle for a long-lived child with an IPC channel and a
kill method, with the same executable resolution it already does. The scheduler moves onto it,
and `oxmutate/src/scheduler.ts` leaves `KNOWN`. That is bellpull's lane, and its own intent
when it is taken up.

**Reversing this.** Reversing it means doing that move now, before oxmutate merges. Nothing else
depends on the raise.
