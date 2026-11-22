// -*- mode: Bluespec; -*-
/**
 * Pollution handled inside the worker (packages/oxmutate/src/runner.ts `recover`; oxmutate-x2
 * workstream 3, oxmutate-fastest 1.3). canary.qnt says when a context is past trusting: the unmutated
 * test fails after a mutant ran. The answer was a new worker, every time, and the rest of the unit
 * re-queued in two halves. This models the cheaper answer and what it must equal.
 *
 * The reference is the restart: a fresh worker holds no state a mutant left, so every verdict decided
 * after a pollution event starts clean. The recovery resets the module registry, collects the file
 * again and carries on in the same worker. It is the same answer only if nothing a mutant left is
 * still there afterwards (`safety`). What a mutant leaves is one of four kinds:
 *
 *   Module        in a module the project evaluated (a cache, a registry, a counter): the registry
 *                 reset drops it, and it is what the canary fails on in practice (pathe's glob cache).
 *   GlobalSeen    on `globalThis`, `process.env` or a built-in prototype, and the test sees it.
 *   GlobalHidden  the same, but no test reads it: the canary passes with it there, and it can still
 *                 decide a later mutant (a memo that hides the next mutant).
 *   External      in something the registry reset does not reach (a module Node loaded itself, a
 *                 native handle): the test sees it, and the snapshot of globals does not.
 *
 * Two guards carry the equality, each for what the other cannot see, and a constant each:
 *
 *   GUARD  before resetting, `globalThis`, `process.env` and the built-in prototypes must equal what
 *          they were when the file was collected (`snapshotDiff`, as staticwarm.qnt's). Anything
 *          else is a restart. Without it a hidden global survives the reset and a later verdict
 *          starts on it.
 *   PROVE  after the reset and the second collection, the unmutated test must pass (a canary on the
 *          fresh collection), and the snapshot must still equal. Anything else is a restart. Without
 *          it state the reset does not reach (`External`) survives into the next verdict.
 *
 * What the model leaves out: a deadlock (the worker is torn down, as before), a file with a
 * `beforeAll` or a run-once file (they keep the restart: a fresh collection's hooks differ), and the
 * residual staticwarm.qnt and confirm.qnt already assume: a change to an existing object that neither
 * the snapshot nor the test can see.
 *
 *   quint run recover.qnt --main=recover      --invariant=safety          holds (the design)
 *   quint run recover.qnt --main=noGuard      --invariant=safety          violated (hidden global)
 *   quint run recover.qnt --main=noProve      --invariant=safety          violated (external state)
 *   quint run recover.qnt --main=doNothing    --invariant=safety          violated (module state stays)
 *   quint run recover.qnt --main=recover      --invariant=neverRecovers   violated (witness: a
 *     recovery happens, so `safety` is not holding because every event restarts)
 *   quint run recover.qnt --main=recover      --invariant=neverRestarts   violated (witness: a
 *     guard still sends some events to a fresh worker)
 */
module recoverLoop {
  const GUARD: bool
  const PROVE: bool
  const RESET: bool

  type Kind = Module | GlobalSeen | GlobalHidden | External

  pure val KINDS = Set(Module, GlobalSeen, GlobalHidden, External)
  pure val MAX_EVENTS = 6

  var dirt: Set[Kind]       // what mutants have left in this worker
  var handled: bool         // the last step handled a pollution event
  var recoveries: int
  var restarts: int
  var events: int

  // What the unmutated test fails on: the canary of canary.qnt.
  pure def canarySees(d: Set[Kind]): bool = d.contains(Module) or d.contains(GlobalSeen) or d.contains(External)
  // What the snapshot of globals, process.env and the prototypes differs on.
  pure def snapshotSees(d: Set[Kind]): bool = d.contains(GlobalSeen) or d.contains(GlobalHidden)
  // What `vi.resetModules()` and a second collection leave.
  pure def afterReset(d: Set[Kind]): Set[Kind] = if (RESET) d.exclude(Set(Module)) else d

  action init = all {
    dirt' = Set(), handled' = false, recoveries' = 0, restarts' = 0, events' = 0,
  }

  // A mutant runs and may leave anything.
  action leave = all {
    events < MAX_EVENTS,
    nondet left = KINDS.powerset().oneOf()
    dirt' = dirt.union(left),
    handled' = false, recoveries' = recoveries, restarts' = restarts, events' = events + 1,
  }

  // The canary failed: the context is polluted. A restart is a fresh worker; a recovery keeps this one.
  action handle = all {
    canarySees(dirt),
    val after = afterReset(dirt)
    val refused = (GUARD and snapshotSees(dirt)) or (PROVE and canarySees(after))
    if (refused) all {
      dirt' = Set(), restarts' = restarts + 1, recoveries' = recoveries,
    } else all {
      dirt' = after, recoveries' = recoveries + 1, restarts' = restarts,
    },
    handled' = true, events' = events,
  }

  action step = any { leave, handle }

  // ── Invariants ──────────────────────────────────────────────────────────────────────────────
  // After a pollution event, whichever way it went, the worker holds nothing a restart would have
  // dropped: every later verdict starts as in a fresh worker.
  val safety = handled implies dirt == Set()
  // Witnesses (expected violated): both ways out of a pollution event are reachable.
  val neverRecovers = recoveries == 0
  val neverRestarts = restarts == 0
}

module recover { import recoverLoop(GUARD = true, PROVE = true, RESET = true).* }
module noGuard { import recoverLoop(GUARD = false, PROVE = true, RESET = true).* }
module noProve { import recoverLoop(GUARD = true, PROVE = false, RESET = true).* }
module doNothing { import recoverLoop(GUARD = false, PROVE = false, RESET = false).* }
