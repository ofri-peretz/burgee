// -*- mode: Bluespec; -*-
/** A counter that never goes below zero: the model the replay test drives src/counter.ts by. */
module counter {
  var n: int

  action init = n' = 0
  action inc = n' = n + 1
  action dec = n' = if (n > 0) n - 1 else n
  action step = any { inc, dec }

  val safety = n >= 0
}
