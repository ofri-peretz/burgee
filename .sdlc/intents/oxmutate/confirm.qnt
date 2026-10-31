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
 *   quint run confirm.qnt --main=confirm    --invariant=safety     holds (SKIP_SINGLE)
 *   quint run confirm.qnt --main=confirmAll --invariant=safety     holds (every survivor confirmed)
 *   quint run confirm.qnt --main=confirm    --invariant=neverCross violated: with 2+ covering tests the
 *     warm run and confirmation do differ, so confirmation is still needed there
 */
module confirmLoop {
  const SKIP_SINGLE: bool

  pure val MAX_TESTS = 3

  var n: int                 // covering tests of the mutant
  var direct: int -> bool    // test i fails with the mutant armed from clean state
  var leaves: int -> bool    // test i, run armed, leaves state that fails every later covering test
  var reported: str          // the verdict oxmutate reports
  var done: bool

  // Warm run: each test alone, from clean state.
  def warmKilled(k: int, d: int -> bool): bool = 1.to(k).exists(i => d.get(i))
  // Confirmation: the tests in order, armed throughout; state carries forward.
  def crossKilled(k: int, d: int -> bool, l: int -> bool): bool =
    1.to(k).exists(i => d.get(i) or 1.to(i - 1).exists(j => l.get(j)))

  action init = {
    nondet k = 1.to(MAX_TESTS).oneOf()
    nondet d = 1.to(MAX_TESTS).setOfMaps(Set(true, false)).oneOf()
    nondet l = 1.to(MAX_TESTS).setOfMaps(Set(true, false)).oneOf()
    all { n' = k, direct' = d, leaves' = l, reported' = "", done' = false }
  }

  action decide = all {
    not(done),
    val verdict =
      if (warmKilled(n, direct)) "Killed"
      else if (SKIP_SINGLE and n == 1) "Survived"
      else if (crossKilled(n, direct, leaves)) "Killed" else "Survived"
    all { reported' = verdict, done' = true, n' = n, direct' = direct, leaves' = leaves },
  }

  action step = any { decide, all { done, reported' = reported, done' = done, n' = n, direct' = direct, leaves' = leaves } }

  // What the whole-file run (Stryker's semantics) would say.
  val truth = if (crossKilled(n, direct, leaves)) "Killed" else "Survived"
  val safety = done implies reported == truth
  // Witness (expected violated): warm and whole-file verdicts can differ, so confirmation matters.
  val neverCross = not(warmKilled(n, direct)) implies not(crossKilled(n, direct, leaves))
}

module confirm { import confirmLoop(SKIP_SINGLE = true).* }
module confirmAll { import confirmLoop(SKIP_SINGLE = false).* }
