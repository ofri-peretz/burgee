// -*- mode: Bluespec; -*-
/**
 * The warm run's units and the verdicts they add up to (packages/oxmutate/src/coordinator.ts, sections
 * 4–5). Each unit runs (mutant, test) pairs of one test file. A finished unit's kills are vouched for
 * (`afterUnit`), except when its canary failed: then they are dropped as suspects and their pairs go
 * back on the queue. Verdicts: Killed if any vouched kill; Survived if every covering pair ran clean;
 * anything else goes to an isolated run, which decides it from the ground truth.
 *
 * FILTER: at dispatch, a unit drops the pairs of mutants already killed (vouched), so no worker runs a
 * mutant another unit has already decided. Before it, 1,022 of 6,550 warm executions on burgee/paratext
 * ran after the mutant's kill (2026-10-30).
 *
 *   quint run dispatch.qnt --main=dispatch  --invariant=safety --max-steps=30   holds (with the filter)
 *   quint run dispatch.qnt --main=noFilter  --invariant=safety --max-steps=30   holds (as 1.0.3)
 *   quint run dispatch.qnt --main=dispatch  --invariant=noSkips                 violated: the filter
 *     does skip work, so `safety` is not holding because nothing is filtered
 */
module dispatchLoop {
  const FILTER: bool

  pure val MUTANTS = Set("m1", "m2")
  pure val TESTS = Set("t1", "t2")
  pure val PAIRS = tuples(MUTANTS, TESTS)

  var kills: (str, str) -> bool     // ground truth: does test t kill mutant m
  var queue: Set[str]               // tests whose unit is still waiting (one unit per test here)
  var pending: Set[(str, str)]      // pairs not yet run (re-queued suspects included)
  var ran: Set[(str, str)]          // pairs that ran clean (survived)
  var vouched: Set[str]             // mutants with a kill a clean canary stood behind
  var skipped: int                  // pairs dropped by the filter
  var done: bool

  action init = all {
    nondet k = PAIRS.setOfMaps(Set(true, false)).oneOf()
    kills' = k,
    queue' = TESTS, pending' = PAIRS, ran' = Set(), vouched' = Set(), skipped' = 0, done' = false,
  }

  // A worker takes test t's unit and runs its pending pairs. With FILTER, pairs of mutants already
  // vouched killed are dropped first. `polluted` drops this unit's kills as suspects: their pairs
  // go back to pending and the unit back on the queue.
  action runUnit(t: str, polluted: bool): bool = all {
    not(done), queue.contains(t),
    val mine = pending.filter(p => p._2 == t)
    val todo = if (FILTER) mine.filter(p => not(vouched.contains(p._1))) else mine
    val killedHere = todo.filter(p => kills.get(p)).map(p => p._1)
    val cleanHere = todo.filter(p => not(kills.get(p)))
    all {
      skipped' = skipped + size(mine) - size(todo),
      ran' = ran.union(cleanHere),
      if (polluted and size(killedHere) > 0) all {
        pending' = pending.exclude(cleanHere).exclude(mine.exclude(todo)),
        vouched' = vouched,
        queue' = queue,
      } else all {
        pending' = pending.exclude(mine),
        vouched' = vouched.union(killedHere),
        queue' = queue.exclude(Set(t)),
      },
      kills' = kills, done' = false,
    },
  }

  action finish = all { not(done), queue == Set(), done' = true,
    kills' = kills, queue' = queue, pending' = pending, ran' = ran, vouched' = vouched, skipped' = skipped }

  action step = {
    nondet t = TESTS.oneOf()
    nondet polluted = Set(true, false).oneOf()
    any { runUnit(t, polluted), finish }
  }

  // ── Verdicts and invariants ───────────────────────────────────────────────────────────────────
  def killable(m: str): bool = TESTS.exists(t => kills.get((m, t)))
  def verdict(m: str): str =
    if (vouched.contains(m)) "Killed"
    else if (TESTS.forall(t => ran.contains((m, t)))) "Survived"
    else if (killable(m)) "Killed" else "Survived"   // the isolated run decides from the truth
  // At the end every mutant's verdict is its ground truth, and no kill was invented.
  val verdictsTrue = done implies MUTANTS.forall(m => (verdict(m) == "Killed") == killable(m))
  val killsAreReal = vouched.forall(m => killable(m))
  val safety = verdictsTrue and killsAreReal
  // Witness (expected violated with FILTER): the filter skips pairs at all.
  val noSkips = skipped == 0
}

module dispatch { import dispatchLoop(FILTER = true).* }
module noFilter { import dispatchLoop(FILTER = false).* }
