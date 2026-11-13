// -*- mode: Bluespec; -*-
/**
 * Static survivors armed in groups (packages/oxmutate/src/runner.ts, `decideStatic`; `static.group`).
 * In a test file that is not a static mutant's first, several mutants are armed for one run of the
 * file. A run that passes reports every member Survived in this file. A run that fails is halved
 * until each failing mutant is found alone. A member drawn for the audit is run again alone, and
 * that run is its verdict.
 *
 * What a file does with a set of mutants armed is not decided by what it does with each alone: two
 * mutants can hide each other (both alone fail, together pass), and two can fail only together.
 * `failsSet` is therefore any function that agrees with `alone` on single mutants.
 *
 *   quint run group.qnt --main=auditAll  --invariant=safety       holds: every survivor is run alone
 *   quint run group.qnt --main=auditNone --invariant=noFalseKill  holds: a kill is always found alone
 *   quint run group.qnt --main=auditNone --invariant=safety       violated: a pair that hides each
 *     other is reported Survived. That is why the option is off by default and audited when on.
 *   quint run group.qnt --main=auditNone --invariant=neverHides   violated: the witness that such a
 *     pair exists in the model, so `safety` does not hold under auditAll for want of one.
 */
module groupLoop {
  const AUDIT_ALL: bool

  pure val MUTANTS = Set(1, 2, 3)

  var alone: int -> bool             // mutant i, armed alone, fails this file
  var failsSet: Set[int] -> bool     // the file's run with exactly this set armed fails
  var reported: int -> str           // "" until decided, then "Killed" or "Survived"
  var done: bool

  // The group as the runner decides it: one run for the whole set; halve on a failure; a single
  // mutant is its own run. Three mutants: {1,2,3} -> {1,2} and {3} -> {1}, {2}.
  def verdictOf(i: int, a: int -> bool, f: Set[int] -> bool): str =
    if (not(f.get(MUTANTS))) {
      if (AUDIT_ALL and a.get(i)) "Killed" else "Survived"
    } else if (i == 3) {
      if (a.get(3)) "Killed" else "Survived"
    } else if (not(f.get(Set(1, 2)))) {
      if (AUDIT_ALL and a.get(i)) "Killed" else "Survived"
    } else {
      if (a.get(i)) "Killed" else "Survived"
    }

  action init = {
    nondet a = MUTANTS.setOfMaps(Set(true, false)).oneOf()
    nondet pair = Set(true, false).oneOf()
    nondet all3 = Set(true, false).oneOf()
    all {
      alone' = a,
      // Single sets agree with `alone`; the pair and the whole set are free.
      failsSet' = Map(Set(1) -> a.get(1), Set(2) -> a.get(2), Set(3) -> a.get(3), Set(1, 2) -> pair, MUTANTS -> all3),
      reported' = MUTANTS.mapBy(_ => ""),
      done' = false,
    }
  }

  action decide = all {
    not(done),
    reported' = MUTANTS.mapBy(i => verdictOf(i, alone, failsSet)),
    done' = true,
    alone' = alone,
    failsSet' = failsSet,
  }

  action step = any { decide, all { done, reported' = reported, done' = done, alone' = alone, failsSet' = failsSet } }

  // What each mutant gets alone, which is what `static.group: 1` reports.
  val safety = done implies MUTANTS.forall(i => reported.get(i) == (if (alone.get(i)) "Killed" else "Survived"))
  // Holds with or without the audit: a group never invents a kill.
  val noFalseKill = done implies MUTANTS.forall(i => reported.get(i) == "Killed" implies alone.get(i))
  // Witness (expected violated): some set passes although a member fails alone.
  val neverHides = not(failsSet.get(MUTANTS)) implies MUTANTS.forall(i => not(alone.get(i)))
}

module auditAll { import groupLoop(AUDIT_ALL = true).* }
module auditNone { import groupLoop(AUDIT_ALL = false).* }
