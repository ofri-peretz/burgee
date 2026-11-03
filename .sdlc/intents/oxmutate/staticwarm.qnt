// -*- mode: Bluespec; -*-
/**
 * Static mutants decided inside one live worker (design 5f): for each mutant, arm it, reset the
 * module registry, re-collect the test file (so its tests close over freshly evaluated modules) and
 * run them. The reference is today's isolated run: a fresh worker per (mutant, file), which shares
 * nothing. The question is what survives a registry reset and can change a later mutant's verdict.
 *
 * Evaluating a module under a mutant may leave a leak outside the registry:
 *   GlobalKey — a key added or a value changed on globalThis / process.env;
 *   InPlace   — an existing object changed in place (a patched built-in prototype, a field set on a
 *               global that was already there): no key changes, so a snapshot cannot see it;
 *   DepState  — state in an externalized dependency (Node's own module cache, which the reset keeps);
 * and a leak may matter (it flips a later verdict: a false kill or a false survivor) or not.
 *
 * Guards, each a constant:
 *   SNAPSHOT  diff globalThis/process.env keys and values around each mutant: catches GlobalKey only.
 *   INLINE    inline every dependency, so the registry reset re-evaluates them too: removes DepState.
 *   CANARY    after each mutant, re-collect unarmed and run: catches a leak that breaks the tests
 *             unmutated (`visible`); a leak that only shifts another mutant's verdict passes it.
 * A detected leak sends that mutant and the rest of the batch to the fresh-worker path.
 *
 * Result: with all three guards `safety` holds unless a module changes an existing object in place
 * and that change both matters and leaves the unmutated tests passing (`withInPlace`). Only a fresh
 * worker rules that out. So the live-worker path also diffs the own-property functions of the
 * built-in prototypes (the common in-place leak, a patched prototype) as part of SNAPSHOT; what is
 * left (a field set on a global that already existed) is the assumption this speedup rests on, and
 * it is checked empirically: zero verdict differences against the fresh-worker path on every bench
 * subject, and `--isolate-static` keeps the fresh-worker path available.
 *
 *   quint run staticwarm.qnt --invariant=safety --max-steps=20       holds (no InPlace leaks)
 *   quint run staticwarm.qnt --main=withInPlace --invariant=safety   violated: the residual risk
 *   quint run staticwarm.qnt --main=resetOnly   --invariant=safety   violated
 *   quint run staticwarm.qnt --main=noInline    --invariant=safety   violated
 *   quint run staticwarm.qnt --invariant=noFallback                  violated (witness: leaks are
 *     caught and sent to the fresh-worker path, so `safety` is not holding vacuously)
 *
 * GROUPED (2026-11-01, sc8-profile.md): the canary runs after the first mutant and then after every
 * `EVERY` (runner.ts caps the doubling at 4), and the verdicts since the last clean canary are held,
 * not reported. A canary that fails sends every held mutant to the fresh-worker path with the rest.
 * A visible leak can then reach the next mutants' verdicts, but those verdicts are held and dropped
 * when the canary at the group's end sees it. The snapshot diff still runs after every mutant. As
 * before, a leak is assumed to stay once made (a later mutant does not undo it).
 *
 *   quint run staticwarm.qnt --main=grouped           --invariant=safety   holds
 *   quint run staticwarm.qnt --main=groupedInPlace    --invariant=safety   violated, as withInPlace:
 *     the residual risk is the same one, an in-place leak the unmutated tests do not see
 *   quint run staticwarm.qnt --main=groupedVisible    --invariant=safety   holds: every in-place
 *     leak the tests see is caught by its group's canary before a flipped verdict is reported
 *   quint run staticwarm.qnt --main=groupedNoHold     --invariant=safety   violated: reporting a
 *     verdict before its group's canary reports one a visible leak flipped
 */
module staticWarm {
  const SNAPSHOT: bool
  const INLINE: bool
  const CANARY: bool
  const IN_PLACE: bool     // can a module change an existing object in place
  const EVERY: int         // mutants between canaries (1 = after each)
  const HOLD: bool         // verdicts wait for their group's canary before they are reported
  const VISIBLE: bool      // every leak breaks the unmutated tests (what isolates HOLD's effect)

  type Leak = NoLeak | GlobalKey | InPlace | DepState
  pure val MUTANTS = 1.to(3)

  var leakOf: int -> Leak        // what evaluating mutant i leaves outside the registry
  var matters: int -> bool       // does that leak flip a later mutant's verdict
  var visible: int -> bool       // does it break the unmutated tests (what a canary sees)
  var cursor: int                  // cursor mutant to decide in this worker
  var dirty: bool                // an undetected leak that matters is live in the worker
  var wrong: int                 // verdicts reported that differ from a fresh worker's
  var fallback: bool             // the batch went to the fresh-worker path
  var held: int                  // verdicts decided since the last canary
  var heldWrong: int             // of those, the ones a live leak flipped
  var seen: bool                 // a leak since the last canary that the canary will see

  action init = {
    nondet l = MUTANTS.setOfMaps(if (IN_PLACE) Set(NoLeak, GlobalKey, InPlace, DepState) else Set(NoLeak, GlobalKey, DepState)).oneOf()
    nondet m = MUTANTS.setOfMaps(Set(true, false)).oneOf()
    nondet v = MUTANTS.setOfMaps(if (VISIBLE) Set(true) else Set(true, false)).oneOf()
    all { leakOf' = l, matters' = m, visible' = v, cursor' = 1, dirty' = false, wrong' = 0, fallback' = false, held' = 0, heldWrong' = 0, seen' = false }
  }

  // Decide mutant `cursor`: its verdict is wrong if a leak from an earlier mutant is live and matters.
  // Then its own leak, if any, is either detected (fall back) or stays live.
  action decide = all {
    not(fallback), cursor <= 3,
    val leak = if (INLINE and leakOf.get(cursor) == DepState) NoLeak else leakOf.get(cursor)
    val snapped = SNAPSHOT and leak == GlobalKey
    val seenNow = seen or (CANARY and leak != NoLeak and not(snapped) and visible.get(cursor))
    val heldNow = held + 1
    val heldWrongNow = if (dirty) heldWrong + 1 else heldWrong
    // The canary runs after the first mutant, then after every EVERY, and after the last.
    val check = cursor == 1 or heldNow >= EVERY or cursor == 3
    val caught = snapped or (check and seenNow)
    all {
      // A held verdict is reported when its group's canary passes; without HOLD, at once.
      // Without HOLD a verdict is out before the canary that would have caught its leak runs.
      wrong' = if (snapped) wrong else if (not(HOLD)) (if (dirty) wrong + 1 else wrong) else if (check and not(seenNow)) wrong + heldWrongNow else wrong,
      dirty' = (dirty or (leak != NoLeak and not(snapped) and matters.get(cursor))),
      fallback' = caught,
      held' = if (check) 0 else heldNow,
      heldWrong' = if (check) 0 else heldWrongNow,
      seen' = if (check) false else seenNow,
      cursor' = cursor + 1,
      leakOf' = leakOf, matters' = matters, visible' = visible,
    },
  }

  action idle = all { fallback or cursor > 3,
    leakOf' = leakOf, matters' = matters, visible' = visible, cursor' = cursor, dirty' = dirty, wrong' = wrong, fallback' = fallback,
    held' = held, heldWrong' = heldWrong, seen' = seen }

  action step = any { decide, idle }

  // No verdict reported from the live worker differs from a fresh worker's.
  val safety = wrong == 0
  // Witness (expected violated in `guarded`): leaks are caught and do send batches back.
  val noFallback = not(fallback)
}

module staticwarm { import staticWarm(SNAPSHOT = true, INLINE = true, CANARY = true, IN_PLACE = false, EVERY = 1, HOLD = true, VISIBLE = false).* }
module withInPlace { import staticWarm(SNAPSHOT = true, INLINE = true, CANARY = true, IN_PLACE = true, EVERY = 1, HOLD = true, VISIBLE = false).* }
module resetOnly { import staticWarm(SNAPSHOT = false, INLINE = false, CANARY = false, IN_PLACE = false, EVERY = 1, HOLD = true, VISIBLE = false).* }
module noInline { import staticWarm(SNAPSHOT = true, INLINE = false, CANARY = true, IN_PLACE = false, EVERY = 1, HOLD = true, VISIBLE = false).* }
module grouped { import staticWarm(SNAPSHOT = true, INLINE = true, CANARY = true, IN_PLACE = false, EVERY = 2, HOLD = true, VISIBLE = false).* }
module groupedInPlace { import staticWarm(SNAPSHOT = true, INLINE = true, CANARY = true, IN_PLACE = true, EVERY = 2, HOLD = true, VISIBLE = false).* }
module groupedVisible { import staticWarm(SNAPSHOT = true, INLINE = true, CANARY = true, IN_PLACE = true, EVERY = 2, HOLD = true, VISIBLE = true).* }
module groupedNoHold { import staticWarm(SNAPSHOT = true, INLINE = true, CANARY = true, IN_PLACE = true, EVERY = 2, HOLD = false, VISIBLE = true).* }
