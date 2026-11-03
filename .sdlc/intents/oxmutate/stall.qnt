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
 */
module stallLoop {
  const IDLE_IS_TIMEOUT: bool

  pure val b = 1              // the warm budget
  pure val B = 2              // the isolated budget (always above the warm one)
  pure val NEVER = 100        // a test that never settles

  var settle: int             // when the mutant's test settles, or NEVER
  var idle: bool              // a stop of it reads idle: the worker waits, its server spends no CPU
  var outcome: str            // what the test settles to: "Killed" or "Survived"
  var reported: str
  var reruns: int             // isolated re-runs at 3x
  var idleReran: bool         // an idle stop was re-run
  var done: bool

  /** The verdict and the re-runs it took, after a warm stop. */
  def isolated(s: int, i: bool, o: str): (str, int) =
    if (s <= B) (o, 0)
    else if (i and IDLE_IS_TIMEOUT) ("Timeout", 0)
    else if (s <= 3 * B) (o, 1)
    else ("Timeout", 1)

  def path(s: int, i: bool, o: str): (str, int) = if (s <= b) (o, 0) else isolated(s, i, o)

  /** Before the decision: every stop re-run at 3x, idle or busy. */
  def before(s: int, o: str): str = if (s <= 3 * B) o else "Timeout"

  action init = {
    nondet s = Set(1, 2, 3, 4, 5, 6, 7, 8, 9, NEVER).oneOf()
    nondet i = Set(true, false).oneOf()
    nondet o = Set("Killed", "Survived").oneOf()
    all { settle' = s, idle' = i, outcome' = o, reported' = "", reruns' = 0, idleReran' = false, done' = false }
  }

  action decide = all {
    not(done),
    val r = path(settle, idle, outcome)
    all {
      reported' = r._1,
      reruns' = r._2,
      idleReran' = (idle and settle > B and r._2 > 0),
      done' = true,
      settle' = settle, idle' = idle, outcome' = outcome,
    },
  }

  action stay = all {
    done,
    reported' = reported, reruns' = reruns, idleReran' = idleReran, done' = done, settle' = settle, idle' = idle, outcome' = outcome,
  }

  action step = any { decide, stay }

  // A Timeout from an idle stop is never re-run, a busy stop is re-run at most once, and the only
  // verdicts that change are idle stalls past the isolated budget, which become Timeout.
  val safety = done implies and {
    not(idleReran),
    reruns <= 1,
    reported == before(settle, outcome) or (idle and settle > B and reported == "Timeout"),
    not(idle) implies reported == before(settle, outcome),
  }
  // Witness (expected violated): some idle stall's verdict does change.
  val neverFlips = done implies reported == before(settle, outcome)
}

module stall { import stallLoop(IDLE_IS_TIMEOUT = true).* }
module stallBefore { import stallLoop(IDLE_IS_TIMEOUT = false).* }
