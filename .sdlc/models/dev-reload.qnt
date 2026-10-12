// -*- mode: Bluespec; -*-
/**
 * `burgee dev`'s reload chain (packages/burgee/src/dev.ts, `reload`):
 *
 *   const next = chain.then(reloadNow); chain = next.catch(...); return next;
 *
 * The first version modelled `await chain; const next = reloadNow(); chain = …` — `chain`
 * re-pointed only after the await — and both properties failed: two saves during one reload
 * waited on the same link and imported at once. Re-check by moving `chain' = c` from `call`
 * back to `start`.
 *
 * Each save that survives the debounce calls `reload()`. One action per JS turn; the
 * awaits are the gaps. `load()` of a newer generation may finish before an older one.
 */
module devReload {
  pure val CALLERS = Set(1, 2, 3)

  type Phase = Idle | WaitChain(int) | Loading(int) | Done
  var phase: int -> Phase       // per caller
  var chain: int                // id of the load `chain` currently stands for; 0 = resolved
  var chainDone: Set[int]       // loads that have finished
  var generation: int
  var genOf: int -> int         // generation each caller's reloadNow took
  var served: int               // generation `server.swap` last installed
  var inFlight: int             // reloadNow() calls running at once

  action init = all {
    phase' = CALLERS.mapBy(c => Idle), chain' = 0, chainDone' = Set(0),
    generation' = 0, genOf' = CALLERS.mapBy(c => 0), served' = 0, inFlight' = 0,
  }

  /** reload() called: queue behind the chain as it is now, and become the chain — same turn. */
  action call(c: int): bool = all {
    phase.get(c) == Idle,
    phase' = phase.set(c, WaitChain(chain)),
    chain' = c, chainDone' = chainDone, generation' = generation, genOf' = genOf,
    served' = served, inFlight' = inFlight,
  }

  /** The awaited chain resolved: reloadNow() starts, and `chain` is re-pointed at it. */
  action start(c: int): bool = all {
    match phase.get(c) { | WaitChain(w) => chainDone.contains(w) | _ => false },
    phase' = phase.set(c, Loading(c)),
    generation' = generation + 1, genOf' = genOf.set(c, generation + 1),
    chain' = chain, inFlight' = inFlight + 1,
    chainDone' = chainDone, served' = served,
  }

  /** load() resolved: `current = …; server.swap(...)`. */
  action finish(c: int): bool = all {
    match phase.get(c) { | Loading(_) => true | _ => false },
    phase' = phase.set(c, Done),
    served' = genOf.get(c), chainDone' = chainDone.union(Set(c)), inFlight' = inFlight - 1,
    chain' = chain, generation' = generation, genOf' = genOf,
  }

  action step = { nondet c = CALLERS.oneOf() any { call(c), start(c), finish(c) } }

  /** "Reloads are serialised" — the comment's own claim. */
  val serialised = inFlight <= 1
  /** Once everything settles, the newest generation is the one served. */
  val newestServed = CALLERS.forall(c => phase.get(c) == Done) implies served == generation

  val safety = serialised and newestServed
}
