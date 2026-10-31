// -*- mode: Bluespec; -*-
/**
 * The warm runner's per-test loop (packages/oxmutate/src/runner.ts `runTask`): run a mutant, and
 * every `canaryEvery` mutants (1, doubling to 8 while clean) re-run the unmutated test as a canary.
 * Before every run after the first, `fresh()` runs the `beforeEach` hooks of `chain(test)`. A failed
 * canary marks the context polluted: the first unchecked verdict stands (it started clean), the
 * rest are suspects, re-queued into a fresh context (`pollutionRestarts`). Survivors are confirmed
 * again in isolation afterwards, so only kills can be decided wrongly here.
 *
 * Two defects in 1.0.3, each a constant:
 *   WALK_FILE      chain() reaches the file. Vitest 5 does not link a top-level describe to its file,
 *                  so a file-level reset never re-ran: every canary read the last mutant's leftovers
 *                  as pollution and each cost a restart (restartsOnlyWithoutHook).
 *   RECHECK_KILLS  a kill after unchecked runs is checked at once: canary, then the mutant again from
 *                  clean state. Without it a kill decided on a previous mutant's leftovers stood when
 *                  the killed run's own `finally` cleaned up, because the batch canary then passed
 *                  (verdictsClean; reproduced by test/fixtures/batch-leftover).
 *
 *   quint run canary.qnt --main=canary  --invariant=safety --max-steps=30          holds (the fix)
 *   quint run canary.qnt --main=v103    --invariant=safety --max-steps=30          violated
 *   quint run canary.qnt --main=noFile  --invariant=restartsOnlyWithoutHook ...    violated
 *   quint run canary.qnt --main=noCheck --invariant=verdictsClean ...              violated
 *   quint run canary.qnt --main=canary  --invariant=neverRestarts                  violated (witness:
 *     pollution is reachable, so `safety` is not holding because nothing pollutes)
 */
module canaryLoop {
  const WALK_FILE: bool
  const RECHECK_KILLS: bool

  type Where = InDescribe | AtFile | Nowhere
  pure val MUTANTS = 6
  pure val MAX_CANARY_EVERY = 8

  var hookAt: Where           // where the suite registers its reset `beforeEach`
  var dirty: bool             // state a run left behind
  var queued: int             // mutants still to run
  var attempt: int            // runs in this context (fresh() runs hooks once attempt > 0)
  var unchecked: List[bool]   // runs since the last clean canary: a kill decided on dirty state?
  var trusted: List[bool]     // reported verdicts: a kill decided on dirty state?
  var canaryEvery: int
  var restarts: int

  // What fresh() resets: the hook only runs if chain() reaches the suite it lives on.
  def hookRuns(w: Where): bool = w == InDescribe or (w == AtFile and WALK_FILE)

  action init = all {
    nondet w = Set(InDescribe, AtFile, Nowhere).oneOf()
    hookAt' = w,
    dirty' = false, queued' = MUTANTS, attempt' = 0,
    unchecked' = [], trusted' = [], canaryEvery' = 1, restarts' = 0,
  }

  // fresh() before the run (attempt > 0), then the mutant runs: it may be killed, and may leave state.
  action runMutant = all {
    queued > 0,
    length(unchecked) < canaryEvery,
    val start = if (attempt > 0 and hookRuns(hookAt)) false else dirty
    nondet killed = Set(true, false).oneOf()
    nondet leaves = Set(true, false).oneOf()
    // RECHECK_KILLS: a kill after unchecked runs triggers a canary on the state the run left.
    if (RECHECK_KILLS and killed and length(unchecked) > 0) {
      val after = if (hookRuns(hookAt)) false else leaves
      if (after) all {
        // Polluted: as a failed canary, and this kill goes back on the queue with the suspects.
        trusted' = trusted.append(unchecked[0]),
        queued' = queued + length(unchecked) - 1,
        unchecked' = [], canaryEvery' = 1, dirty' = false, attempt' = 0,
        restarts' = restarts + 1, hookAt' = hookAt,
      } else all {
        // Clean: the batch stands, and the mutant is decided again from clean state; that run is
        // unchecked again (`unchecked.push(id)`), for the next canary to vouch for.
        trusted' = trusted.concat(unchecked),
        unchecked' = [false],
        canaryEvery' = if (canaryEvery * 2 > MAX_CANARY_EVERY) MAX_CANARY_EVERY else canaryEvery * 2,
        nondet leaves2 = Set(true, false).oneOf()
        dirty' = leaves2,
        queued' = queued - 1, attempt' = attempt + 2, restarts' = restarts, hookAt' = hookAt,
      }
    } else all {
      unchecked' = unchecked.append(start and killed),
      dirty' = leaves,
      queued' = queued - 1,
      attempt' = attempt + 1,
      trusted' = trusted, canaryEvery' = canaryEvery, restarts' = restarts, hookAt' = hookAt,
    },
  }

  // The canary: fresh(), then the unmutated test, which passes only on clean state.
  action canary = all {
    length(unchecked) > 0,
    length(unchecked) >= canaryEvery or queued == 0,
    val start = if (hookRuns(hookAt)) false else dirty
    if (not(start)) all {
      trusted' = trusted.concat(unchecked),
      unchecked' = [],
      canaryEvery' = if (canaryEvery * 2 > MAX_CANARY_EVERY) MAX_CANARY_EVERY else canaryEvery * 2,
      dirty' = false, attempt' = attempt + 1,
      queued' = queued, restarts' = restarts, hookAt' = hookAt,
    } else all {
      // Polluted: the first verdict stands, the suspects go back on the queue, the context restarts.
      trusted' = trusted.append(unchecked[0]),
      queued' = queued + length(unchecked) - 1,
      unchecked' = [],
      canaryEvery' = 1, dirty' = false, attempt' = 0,
      restarts' = restarts + 1, hookAt' = hookAt,
    },
  }

  action step = any { runMutant, canary }

  // ── Invariants ──────────────────────────────────────────────────────────────────────────────
  // No reported verdict was decided on another mutant's leftovers.
  val verdictsClean = trusted.foldl(true, (ok, d) => ok and not(d))
  // A context restarts only when the suite has no reset hook at all.
  val restartsOnlyWithoutHook = restarts > 0 implies hookAt == Nowhere
  val safety = verdictsClean and restartsOnlyWithoutHook
  // Witness (expected violated): pollution is reachable at all, so `safety` is not vacuous.
  val neverRestarts = restarts == 0
}

module canary { import canaryLoop(WALK_FILE = true, RECHECK_KILLS = true).* }
module v103 { import canaryLoop(WALK_FILE = false, RECHECK_KILLS = false).* }
module noFile { import canaryLoop(WALK_FILE = false, RECHECK_KILLS = true).* }
module noCheck { import canaryLoop(WALK_FILE = true, RECHECK_KILLS = false).* }
