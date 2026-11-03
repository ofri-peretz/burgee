// -*- mode: Bluespec; -*-
/**
 * Run-once test files (packages/oxmutate/src/runner.ts `runOnce`). ESLint's RuleTester records each
 * case as its test runs and fails one it has seen, so a test's closure runs once per collection: every
 * run after the first fails whatever the mutant. The warm runner runs a test once per mutant and again
 * as the canary (canary.qnt), so each canary failed, read as pollution, and restarted the context
 * (eslint-plugin-mongodb-security: 279 mutants, 13,868 restarts, 69 min, 2026-11-03).
 *
 * The fix, one constant:
 *   FRESH  the dry run runs a file's first passing test twice; a failure marks the file run-once, and
 *          each run after a test's first takes its closure from a fresh collection of the file. The
 *          code under test is not evaluated again, so state a mutant left there survives into the
 *          fresh copy and still fails the canary.
 *
 *   quint run rerun.qnt --main=rerun --invariant=safety --max-steps=30                  holds (the fix)
 *   quint run rerun.qnt --main=v122  --invariant=safety --max-steps=30                  violated
 *   quint run rerun.qnt --main=rerun --invariant=neverRestarts --max-steps=30           violated (witness:
 *     pollution still restarts, so `safety` is not holding because nothing is caught)
 */
module rerunLoop {
  const FRESH: bool

  pure val MUTANTS = 4

  var runOnce: bool        // the file's tests fail a second run from one collection
  var detected: bool       // the dry run's second run failed
  var used: bool           // the closure the next run would use has run before
  var dirty: bool          // state a mutant left in the code under test
  var queued: int
  var verdicts: List[bool] // each verdict: decided by a reused closure's failure, not by the mutant?
  var restarts: int
  var polluting: int       // mutants that left state behind

  action init = {
    nondet once = Set(true, false).oneOf()
    all {
      runOnce' = once,
      detected' = (FRESH and once), // the probe fails exactly when the file is run-once
      used' = false, dirty' = false, queued' = MUTANTS,
      verdicts' = [], restarts' = 0, polluting' = 0,
    }
  }

  // One run: a fresh copy when the file was detected, else the same closure again.
  def reused(u: bool): bool = runOnce and u and not(detected)

  action runMutant = all {
    queued > 0,
    nondet leaves = Set(true, false).oneOf()
    all {
      verdicts' = verdicts.append(reused(used)),
      dirty' = (dirty or leaves),
      polluting' = if (leaves) polluting + 1 else polluting,
      used' = true,
      queued' = queued - 1,
      runOnce' = runOnce, detected' = detected, restarts' = restarts,
    },
  }

  // The canary: the unmutated test passes only on clean state from a closure that has not run.
  action canary = all {
    length(verdicts) > 0,
    if (dirty or reused(used)) all {
      restarts' = restarts + 1,
      // A fresh context: modules and the collection start over.
      dirty' = false, used' = false,
      verdicts' = verdicts, queued' = queued, polluting' = polluting,
      runOnce' = runOnce, detected' = detected,
    } else all {
      used' = true,
      restarts' = restarts, dirty' = dirty, verdicts' = verdicts, queued' = queued, polluting' = polluting,
      runOnce' = runOnce, detected' = detected,
    },
  }

  action step = any { runMutant, canary }

  // ── Invariants ──────────────────────────────────────────────────────────────────────────────
  // No verdict was decided by a reused closure failing rather than by the mutant.
  val verdictsOnMutant = verdicts.foldl(true, (ok, r) => ok and not(r))
  // A context restarts only after some mutant left state behind.
  val restartsOnlyOnPollution = restarts > 0 implies polluting > 0
  val safety = verdictsOnMutant and restartsOnlyOnPollution
  // Witness (expected violated): pollution still restarts a run-once file's context too.
  val neverRestarts = restarts == 0
}

module rerun { import rerunLoop(FRESH = true).* }
module v122 { import rerunLoop(FRESH = false).* }
