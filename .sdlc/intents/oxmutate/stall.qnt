// -*- mode: Bluespec; -*-
/**
 * The watchdog's idle/busy split (packages/oxmutate/src/heartbeat.ts, scheduler.ts, coordinator.ts;
 * .sdlc/decisions/D-20261101-idle-stall-is-timeout.md).
 *
 * A mutant's test either settles at some time `s` with an outcome (Killed or Survived), or never
 * settles. A run that passes its budget is stopped. The stop reads the run as `idle` (the worker is
 * inside a test body, its event loop turns and the server burns under 25% of a core: it waits on
 * something the mutant never lets happen) or `busy` (a loop, a slow test on a loaded machine, or a
 * worker still loading its file).
 *
 * The path: a warm run with budget `b`; a stop sends the mutant to an isolated run with budget `B`.
 * A busy stop there is re-run once with `3B`, and a stop on that re-run is a Timeout. An idle stop is
 * a Timeout as it stands (`IDLE_IS_TIMEOUT = true`), the way Stryker scores it. Before the decision
 * (`IDLE_IS_TIMEOUT = false`) it was re-run at 3x too, and an idle test that Vitest's own timeout
 * failed inside 3B came out Killed.
 *
 *   quint run stall.qnt --main=stall       --invariant=safety     holds
 *   quint run stall.qnt --main=stallBefore --invariant=safety     violated: an idle stop is re-run
 *   quint run stall.qnt --main=stall       --invariant=neverFlips violated: some idle stall's verdict
 *     changes (Killed -> Timeout), so `safety` is not holding because no stall is ever idle
 *
 * Deadlocks (quiescence.ts, staged spec oxmutate-load-robust L1). Before any budget, the worker may
 * call its own wait a deadlock: its thread and the process are quiet, no Vitest call is in flight, no
 * timer is pending and it holds nothing beyond its floor, for a whole confirm window. Then the
 * mutant is a Timeout at once: no watchdog wait, no re-run. `SOUND` is the detector's claim that a
 * quiet wait is one that never settles; the model checks what follows from it, and what breaks
 * without it.
 *
 *   quint run stall.qnt --main=stall        --invariant=safety     holds (deadlocks called, sound)
 *   quint run stall.qnt --main=stallUnsound --invariant=safety     violated: a test that would have
 *     settled is called a deadlock, and its verdict changes
 *   quint run stall.qnt --main=stall        --invariant=noDeadlock violated: some deadlock is called,
 *     so `safety` is not holding because the detector never fires
 */
module stallLoop {
  const IDLE_IS_TIMEOUT: bool
  /** The worker calls quiet waits deadlocks before any budget (quiescence.ts). */
  const DEADLOCK: bool
  /** The detector's premise: a quiet wait is one that never settles. */
  const SOUND: bool

  pure val b = 1              // the warm budget
  pure val B = 2              // the isolated budget (always above the warm one)
  pure val NEVER = 100        // a test that never settles

  var settle: int             // when the mutant's test settles, or NEVER
  var idle: bool              // a stop of it reads idle: the worker waits, its server spends no CPU
  var outcome: str            // what the test settles to: "Killed" or "Survived"
  var reported: str
  var reruns: int             // isolated re-runs at 3x
  var idleReran: bool         // an idle stop was re-run
  var quiet: bool             // the wait reads quiet to the worker for a whole confirm window
  var deadlockCalled: bool    // the worker called it a deadlock
  var done: bool

  /** The verdict and the re-runs it took, after a warm stop. */
  def isolated(s: int, i: bool, o: str): (str, int) =
    if (s <= B) (o, 0)
    else if (i and IDLE_IS_TIMEOUT) ("Timeout", 0)
    else if (s <= 3 * B) (o, 1)
    else ("Timeout", 1)

  def path(s: int, i: bool, o: str): (str, int) = if (s <= b) (o, 0) else isolated(s, i, o)

  /** With the detector: a quiet wait is a Timeout at once, inside the warm budget. */
  def withDeadlocks(s: int, i: bool, o: str, q: bool): (str, int) = if (DEADLOCK and q) ("Timeout", 0) else path(s, i, o)

  /** Before the decision: every stop re-run at 3x, idle or busy. */
  def before(s: int, o: str): str = if (s <= 3 * B) o else "Timeout"

  action init = {
    nondet s = Set(1, 2, 3, 4, 5, 6, 7, 8, 9, NEVER).oneOf()
    nondet i = Set(true, false).oneOf()
    nondet o = Set("Killed", "Survived").oneOf()
    nondet q = Set(true, false).oneOf()
    all {
      // Sound: only a wait that never settles reads quiet. A quiet wait is also idle: nothing burns CPU.
      not(SOUND) or not(q) or s == NEVER,
      not(q) or i,
      settle' = s, idle' = i, outcome' = o, quiet' = q, reported' = "", reruns' = 0, idleReran' = false, deadlockCalled' = false, done' = false,
    }
  }

  action decide = all {
    not(done),
    val r = withDeadlocks(settle, idle, outcome, quiet)
    all {
      reported' = r._1,
      reruns' = r._2,
      idleReran' = (idle and settle > B and r._2 > 0),
      deadlockCalled' = (DEADLOCK and quiet),
      done' = true,
      settle' = settle, idle' = idle, outcome' = outcome, quiet' = quiet,
    },
  }

  action stay = all {
    done,
    reported' = reported, reruns' = reruns, idleReran' = idleReran, deadlockCalled' = deadlockCalled, done' = done, settle' = settle, idle' = idle, outcome' = outcome, quiet' = quiet,
  }

  action step = any { decide, stay }

  // A Timeout from an idle stop is never re-run, a busy stop is re-run at most once, and the only
  // verdicts that change are idle stalls past the isolated budget, which become Timeout.
  val safety = done implies and {
    not(idleReran),
    reruns <= 1,
    reported == before(settle, outcome) or (idle and settle > B and reported == "Timeout"),
    not(idle) implies reported == before(settle, outcome),
    // A deadlock is called only on a test that never settles, takes no re-run, and its verdict is the
    // one the old path reached after waiting out every budget.
    deadlockCalled implies (settle == NEVER and reruns == 0 and reported == "Timeout"),
  }
  // Witness (expected violated): some deadlock is called.
  val noDeadlock = done implies not(deadlockCalled)
  // Witness (expected violated): some idle stall's verdict does change.
  val neverFlips = done implies reported == before(settle, outcome)
}

module stall { import stallLoop(IDLE_IS_TIMEOUT = true, DEADLOCK = true, SOUND = true).* }
module stallBefore { import stallLoop(IDLE_IS_TIMEOUT = false, DEADLOCK = false, SOUND = true).* }
module stallUnsound { import stallLoop(IDLE_IS_TIMEOUT = true, DEADLOCK = true, SOUND = false).* }
