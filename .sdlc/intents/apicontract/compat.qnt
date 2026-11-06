// -*- mode: Bluespec; -*-
/**
 * apicontract's direction-aware compatibility rule (`spec.md` R3, R-Q1).
 *
 * A payload version is what its sender may emit (`s`) and what its receiver accepts (`r`),
 * over a small universe of values. A version is coherent when `s` ⊆ `r`.
 *   BACKWARD(old, new): the new receiver accepts everything the old sender emitted.
 *   FORWARD(old, new):  the old receiver accepts everything the new sender emits.
 *   FULL:               both.
 * Request/response is this rule twice: the request's receiver is the server, the response's
 * receiver is the client.
 *
 * `safety` holds the laws `diff` relies on. `fullChains` is expected to be VIOLATED: FULL
 * between adjacent versions does not give FULL between the endpoints, which is why
 * `diff --since <ref>` compares the two endpoints directly and never chains per-commit verdicts.
 *
 * Run by hand:
 *   npx -y @informalsystems/quint@0.33.0 run .sdlc/intents/apicontract/compat.qnt \
 *     --invariant=safety --max-steps=30 --max-samples=20000
 */
module compat {
  pure val VALUES = Set(1, 2, 3)

  type Ver = { s: Set[int], r: Set[int] }

  var a: Ver
  var b: Ver
  var c: Ver

  pure def backward(old: Ver, nu: Ver): bool = old.s.subseteq(nu.r)
  pure def forward(old: Ver, nu: Ver): bool = nu.s.subseteq(old.r)
  pure def full(old: Ver, nu: Ver): bool = backward(old, nu) and forward(old, nu)

  action choose = {
    nondet ra = VALUES.powerset().oneOf()
    nondet sa = ra.powerset().oneOf()
    nondet rb = VALUES.powerset().oneOf()
    nondet sb = rb.powerset().oneOf()
    nondet rc = VALUES.powerset().oneOf()
    nondet sc = rc.powerset().oneOf()
    all {
      a' = { s: sa, r: ra },
      b' = { s: sb, r: rb },
      c' = { s: sc, r: rc },
    }
  }

  action init = choose
  action step = choose

  // A version compared with itself is FULL.
  val noopIsFull = full(a, a)
  // Reversing a diff swaps BACKWARD and FORWARD.
  val reversalSwaps = backward(a, b) == forward(b, a)
  // Widening only the receiver never breaks BACKWARD.
  val widenReceiverIsBackward =
    (a.s == b.s and a.r.subseteq(b.r)) implies backward(a, b)
  // Widening the sender (an emitted value the old receiver rejects) breaks FORWARD.
  val widenSenderBreaksForward =
    (b.s.exists(v => not(a.r.contains(v)))) implies not(forward(a, b))

  val safety = all {
    noopIsFull,
    reversalSwaps,
    widenReceiverIsBackward,
    widenSenderBreaksForward,
  }

  // Expected violation (see header).
  val fullChains = (full(a, b) and full(b, c)) implies full(a, c)
}
