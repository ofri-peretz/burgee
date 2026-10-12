// -*- mode: Bluespec; -*-
/**
 * closeout's shutdown registry (`packages/closeout/src/registry.ts`) as a state machine.
 *
 * `spec.md` states the machine in prose ("The state machine, stated once"). This is the
 * same machine in a form a model checker can drive through every interleaving the matrix
 * test cannot enumerate by hand: triggers arriving mid-phase, the deadline firing between
 * a settle and a wake, `'exit'` landing while a run is parked.
 *
 * Granularity: one JS turn is one action. A phase is invoked atomically (the `for … of` in
 * `invokePhase` never yields); the gaps between actions are exactly the `await`s in `run`.
 *
 * Checked by `scripts/quint-models-lock.test.ts`. Run by hand:
 *   npx @informalsystems/quint run .sdlc/intents/closeout/registry.qnt \
 *     --invariant=safety --max-steps=30 --max-samples=20000
 */
module registry {
  pure val HANDLERS = Set("h1", "h2", "h3", "h4")
  // PHASES, by index: flush, release, restore.
  pure val RESTORE = 2
  pure val PHASE_COUNT = 3

  type State = {
    // What each handler is. Chosen once, in init: the checker tries every assignment.
    phaseOf: str -> int,
    isAsync: str -> bool,
    // The registry.
    registered: Set[str],
    atStart: Set[str],
    invoked: str -> int,
    settled: Set[str],
    // The shutdown: "idle" (state.started false), "running" (a run's loop is live), "done".
    mode: str,
    next: int,
    pending: Set[str],
    expired: bool,
    syncFired: bool,
    // Ghost: set if a phase was ever invoked while an earlier one was still owed a wait.
    orderBroken: bool,
    // The report.
    unfinished: Set[str],
    timedOut: bool,
  }

  var s: State

  def inPhase(st: State, p: int): Set[str] = st.registered.filter(h => st.phaseOf.get(h) == p)

  def invokeAll(st: State, hs: Set[str]): str -> int =
    HANDLERS.mapBy(h => if (hs.contains(h)) st.invoked.get(h) + 1 else st.invoked.get(h))

  /** `tracking.filter((f) => !f.settled)`: async handlers invoked and not back. */
  def inFlight(st: State): Set[str] =
    HANDLERS.filter(h => st.isAsync.get(h) and st.invoked.get(h) > 0 and not(st.settled.contains(h)))

  action init = {
    nondet phaseOf = HANDLERS.setOfMaps(0.to(2)).oneOf()
    nondet isAsync = HANDLERS.setOfMaps(Set(true, false)).oneOf()
    s' = {
      phaseOf: phaseOf, isAsync: isAsync,
      registered: Set(), atStart: Set(), invoked: HANDLERS.mapBy(h => 0), settled: Set(),
      mode: "idle", next: 0, pending: Set(), expired: false, syncFired: false,
      orderBroken: false, unfinished: Set(), timedOut: false,
    }
  }

  // ── add() and its unsubscribe, before any trigger ─────────────────────────────────────
  action register = {
    nondet h = HANDLERS.oneOf()
    all { s.mode == "idle", s' = { ...s, registered: s.registered.union(Set(h)) } }
  }

  action unregister = {
    nondet h = HANDLERS.oneOf()
    all { s.mode == "idle", s' = { ...s, registered: s.registered.exclude(Set(h)) } }
  }

  /** add() while a run is in flight: the code allows it, spec.md does not say what it means. */
  action lateRegister = {
    nondet h = HANDLERS.oneOf()
    all {
      s.mode == "running", not(s.registered.contains(h)),
      s' = { ...s, registered: s.registered.union(Set(h)) },
    }
  }

  // ── run(): the first trigger starts the one bounded shutdown ───────────────────────────
  action startRun = all {
    s.mode == "idle",
    s' = { ...s, mode: "running", next: 0, atStart: s.registered },
  }

  /** One turn of `while (next < PHASES.length)`: invoke the phase, then park on it or not. */
  action invokeNextPhase = {
    val hs = inPhase(s, s.next)
    val owed = inFlight(s).exists(h => s.phaseOf.get(h) < s.next)
    all {
      s.mode == "running", s.next < PHASE_COUNT, s.pending == Set(),
      s' = {
        ...s,
        invoked: invokeAll(s, hs),
        next: s.next + 1,
        // `if (pending.length === 0 || clock.expired) continue;`
        pending: if (s.expired) Set() else hs.filter(h => s.isAsync.get(h)),
        orderBroken: s.orderBroken or (not(s.expired) and owed),
      },
    }
  }

  /** A handler's promise settles — resolve or reject, the registry treats both as back. */
  action settle = {
    nondet h = HANDLERS.oneOf()
    all {
      s.isAsync.get(h), s.invoked.get(h) > 0, not(s.settled.contains(h)),
      s' = { ...s, settled: s.settled.union(Set(h)) },
    }
  }

  /** `Promise.race([allSettled(pending), clock.reached])` resolves. */
  action wake = all {
    s.mode == "running", s.pending != Set(),
    s.pending.subseteq(s.settled) or s.expired,
    s' = { ...s, pending: Set() },
  }

  /** The one clock fires. It exists only while a run's loop is live (`finally` cancels it). */
  action expire = all {
    s.mode == "running", not(s.expired),
    s' = { ...s, expired: true },
  }

  action finish = all {
    s.mode == "running", s.next == PHASE_COUNT, s.pending == Set(),
    s' = { ...s, mode: "done", unfinished: inFlight(s), timedOut: s.expired },
  }

  // ── runSync(): `'exit'` ────────────────────────────────────────────────────────────────
  action runSyncFresh = all {
    s.mode == "idle",
    s' = {
      ...s,
      mode: "done", syncFired: true, atStart: s.registered,
      invoked: invokeAll(s, s.registered),
      unfinished: s.registered.filter(h => s.isAsync.get(h)),
      timedOut: false,
    },
  }

  /** `rest?.()`: `'exit'` lands while a run is parked; every phase not yet reached is invoked. */
  action runSyncMid = all {
    s.mode == "running",
    s' = {
      ...s,
      invoked: invokeAll(s, s.registered.filter(h => s.phaseOf.get(h) >= s.next)),
      next: PHASE_COUNT,
      syncFired: true,
    },
  }

  action idle = all { s.mode == "done", s' = s }

  action step = any {
    register, unregister, lateRegister, startRun, invokeNextPhase, settle, wake, expire,
    finish, runSyncFresh, runSyncMid, idle,
  }

  // ── Invariants: R1, R3, R4 of spec.md ──────────────────────────────────────────────────

  /** R1. However many triggers arrive, in whatever order, no handler runs twice. */
  val exactlyOnce = HANDLERS.forall(h => s.invoked.get(h) <= 1)

  /** Phases are a sequence: none starts while an earlier one is owed a wait. */
  val phaseOrder = not(s.orderBroken)

  /** R4. Once shutdown has run, every `restore` handler registered before it has been invoked. */
  val restoreAlwaysRuns =
    (s.mode == "done" or s.syncFired) implies
      s.atStart.forall(h => s.phaseOf.get(h) == RESTORE implies s.invoked.get(h) == 1)

  /** R3. The report names only handlers that were really running, and is empty if nothing was cut off. */
  val honestReport = s.mode == "done" implies and {
    s.unfinished.forall(h => s.isAsync.get(h) and s.invoked.get(h) > 0),
    (not(s.timedOut) and not(s.syncFired)) implies s.unfinished == Set(),
    s.timedOut == s.expired,
  }

  val safety = exactlyOnce and phaseOrder and restoreAlwaysRuns and honestReport

  /**
   * Not a guarantee — a question. A handler add()ed mid-run into a phase the run has passed
   * is never invoked and no report names it. Expected to be VIOLATED; the lock pins that, so
   * the day the code changes, this flips and someone has to decide which answer is right.
   */
  val lateAddRuns = s.mode == "done" implies s.registered.forall(h => s.invoked.get(h) > 0)
}
