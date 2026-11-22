// -*- mode: Bluespec; -*-
/**
 * Survivor confirmation (packages/oxmutate/src/coordinator.ts, 6b). The warm runner decides a mutant
 * one covering test at a time, each from clean state with the mutant armed through the test's hooks.
 * Confirmation re-runs a survivor armed across all its covering tests in order, so state one test
 * leaves can kill the next (Stryker's semantics). A mutant either breaks a test outright (`direct`)
 * or leaves state behind (`leaves`) that breaks any later covering test.
 *
 * SKIP_SINGLE: a survivor with one covering test is reported without confirmation. With one test there
 * is no later test for leftover state to reach, so the confirmation run equals the warm run.
 *
 *   quint run confirm.qnt --main=confirm    --invariant=safety     holds (every survivor; see MEMO below)
 *   quint run confirm.qnt --main=confirmAll --invariant=safety     holds (every survivor confirmed)
 *   quint run confirm.qnt --main=confirm    --invariant=neverCross violated: with 2+ covering tests the
 *     warm run and confirmation do differ, so confirmation is still needed there
 *
 * MEMO (2026-11-20, oxmutate-x2 workstream 3): SKIP_SINGLE's argument, that with one test the warm run
 * equals the confirmation run, assumed the warm run armed the test on clean modules. It armed it after
 * other runs in the same module instance, and a memo they filled (pathe's glob cache, `_glob.ts`) hides
 * a mutant in the code that computed the value: warm Survived, killed by a fresh worker (`hidden`).
 * No hit count tells which: a mutant whose code was reached is hidden through the value it returned.
 * So every survivor is confirmed, on cold modules (`confirm`, `confirmLive`); `confirmSkipSingle` is the
 * old rule and violates `safety`. OXMUTATE_TRUST_WARM_SURVIVORS=1 restores it.
 *
 *   quint run confirm.qnt --main=confirmSkipSingle --invariant=safety     violated (a hidden kill)
 *
 * LIVE (2026-11-19, oxmutate-x2 workstream 1): the confirmation runs in a live worker instead of a
 * fresh one per (mutant, file), on the static path's machinery (staticwarm.qnt): the mutant is armed,
 * the module registry reset and the file collected again, so its tests close over modules evaluated
 * under the mutant from collection on, as in a fresh worker. Two things could make it differ from the
 * fresh run, and each is a constant here:
 *
 *   ONLY_COVERING  the live run executes the bodies of the mutant's covering tests only, and the hooks
 *                  of every test the run includes. The fresh run does the same (OXMUTATE_ONLY_TESTS:
 *                  Vitest calls every test's hooks, the runner skips a body outside the set). A test
 *                  that does not cover the mutant can still fail with it armed, through state the
 *                  covering tests left (`other`); running its body would report a kill the
 *                  reference does not.
 *   GUARDED        an earlier mutant in the same worker left state that flips this verdict (`flip`).
 *                  staticwarm.qnt shows its guards (snapshot diff, inlined dependencies, the unarmed
 *                  re-collection, held verdicts) leave no such leak but an in-place change the
 *                  unmutated tests cannot see; that residual is the static path's, assumed the same
 *                  way and checked the same way (bench/ab.mjs and the corpus digest equal).
 *
 * What the model leaves out, because the live path hands it back to the fresh run, where today's rules
 * decide it: a run stopped by the watchdog or its hit limit, a deadlock, a kill only by a test's own
 * timeout (the RERUN_SLACK recheck), and a file whose run the live runner does not model (retry,
 * repeats, `fails`, concurrent tests, around-hooks, onTestFinished/onTestFailed, context.skip();
 * collected.ts). Survivors are never grouped (static.group): a group can hide a kill (group.qnt).
 *
 *   quint run confirm.qnt --main=confirmLive          --invariant=safety   holds
 *   quint run confirm.qnt --main=confirmLiveAllBodies --invariant=safety   violated: running the
 *     bodies of tests that do not cover the mutant reports kills the fresh run does not
 *   quint run confirm.qnt --main=confirmLiveUnguarded --invariant=safety   violated: without the
 *     static path's guards a leak from the previous confirmation flips the verdict
 */
module confirmLoop {
  const SKIP_SINGLE: bool
  const MEMO: bool
  const LIVE: bool
  const ONLY_COVERING: bool
  const GUARDED: bool

  pure val MAX_TESTS = 3

  var n: int                 // covering tests of the mutant
  var direct: int -> bool    // test i fails with the mutant armed from clean state
  var leaves: int -> bool    // test i, run armed, leaves state that fails every later covering test
  var other: bool            // a test that does not cover the mutant fails if its body runs armed after them
  var hidden: bool           // a memo an earlier warm run filled hides the kill from the warm run
  var flip: bool             // an uncaught leak from an earlier live confirmation flips this verdict
  var reported: str          // the verdict oxmutate reports
  var done: bool

  // Warm run: each test alone, from clean state.
  def warmKilled(k: int, d: int -> bool, h: bool): bool = 1.to(k).exists(i => d.get(i)) and not(h)
  // Confirmation: the tests in order, armed throughout; state carries forward.
  def crossKilled(k: int, d: int -> bool, l: int -> bool): bool =
    1.to(k).exists(i => d.get(i) or 1.to(i - 1).exists(j => l.get(j)))
  // The live run: the covering tests' bodies (and, without ONLY_COVERING, the others'), then any leak.
  def liveKilled(k: int, d: int -> bool, l: int -> bool, o: bool, f: bool): bool =
    val ran = crossKilled(k, d, l) or (not(ONLY_COVERING) and o)
    if (f) not(ran) else ran

  action init = {
    nondet k = 1.to(MAX_TESTS).oneOf()
    nondet d = 1.to(MAX_TESTS).setOfMaps(Set(true, false)).oneOf()
    nondet l = 1.to(MAX_TESTS).setOfMaps(Set(true, false)).oneOf()
    nondet o = Set(true, false).oneOf()
    nondet f = (if (LIVE and not(GUARDED)) Set(true, false) else Set(false)).oneOf()
    nondet h = (if (MEMO) Set(true, false) else Set(false)).oneOf()
    all { n' = k, direct' = d, leaves' = l, other' = o, flip' = f, hidden' = h, reported' = "", done' = false }
  }

  action decide = all {
    not(done),
    val confirmed = if (LIVE) liveKilled(n, direct, leaves, other, flip) else crossKilled(n, direct, leaves)
    val verdict =
      if (warmKilled(n, direct, hidden)) "Killed"
      else if (SKIP_SINGLE and n == 1) "Survived"
      else if (confirmed) "Killed" else "Survived"
    all { reported' = verdict, done' = true, n' = n, direct' = direct, leaves' = leaves, other' = other, flip' = flip, hidden' = hidden },
  }

  action step = any { decide, all { done, reported' = reported, done' = done, n' = n, direct' = direct, leaves' = leaves, other' = other, flip' = flip, hidden' = hidden } }

  // What the whole-file run (Stryker's semantics, a fresh worker running the covering tests) would say.
  val truth = if (crossKilled(n, direct, leaves)) "Killed" else "Survived"
  val safety = done implies reported == truth
  // Witness (expected violated): warm and whole-file verdicts can differ, so confirmation matters.
  val neverCross = not(warmKilled(n, direct, hidden)) implies not(crossKilled(n, direct, leaves))
}

module confirm { import confirmLoop(SKIP_SINGLE = false, MEMO = true, LIVE = false, ONLY_COVERING = true, GUARDED = true).* }
module confirmSkipSingle { import confirmLoop(SKIP_SINGLE = true, MEMO = true, LIVE = false, ONLY_COVERING = true, GUARDED = true).* }
module confirmAll { import confirmLoop(SKIP_SINGLE = false, MEMO = true, LIVE = false, ONLY_COVERING = true, GUARDED = true).* }
module confirmLive { import confirmLoop(SKIP_SINGLE = false, MEMO = true, LIVE = true, ONLY_COVERING = true, GUARDED = true).* }
module confirmLiveAllBodies { import confirmLoop(SKIP_SINGLE = false, MEMO = true, LIVE = true, ONLY_COVERING = false, GUARDED = true).* }
module confirmLiveUnguarded { import confirmLoop(SKIP_SINGLE = false, MEMO = true, LIVE = true, ONLY_COVERING = true, GUARDED = false).* }
