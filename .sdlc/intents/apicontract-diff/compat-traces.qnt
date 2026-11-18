// -*- mode: Bluespec; -*-
/**
 * The trace generator for `diff`'s classifier (spec.md R2, Verification). It adds no law: each
 * state is one (old, new) pair of `compat.qnt` versions with the verdicts `compat.qnt` itself
 * computes, so a trace is a table of answers the classifier must reproduce.
 *
 * Regenerate (the committed fixtures were made with exactly this):
 *   npx -y @informalsystems/quint@0.33.0 run .sdlc/intents/apicontract-diff/compat-traces.qnt \
 *     --max-steps=15 --max-samples=24 --n-traces=24 --seed=0x5eed \
 *     --out-itf='packages/apicontract/src/__fixtures__/diff/traces/compat-{seq}.itf.json'
 */
module compatTraces {
  import compat as C from "../apicontract/compat"

  var old: C::Ver
  var nu: C::Ver
  var verdict: { backward: bool, forward: bool, full: bool }

  action pick = {
    nondet ro = C::VALUES.powerset().oneOf()
    nondet so = ro.powerset().oneOf()
    nondet rn = C::VALUES.powerset().oneOf()
    nondet sn = rn.powerset().oneOf()
    val o = { s: so, r: ro }
    val n = { s: sn, r: rn }
    all {
      old' = o,
      nu' = n,
      verdict' = { backward: C::backward(o, n), forward: C::forward(o, n), full: C::full(o, n) },
      C::choose,
    }
  }

  action init = pick
  action step = pick

  // `models.yml` runs every model with `--invariant=safety`: compat.qnt's laws, which hold on the
  // versions `C::choose` draws beside each pair, and FULL being BACKWARD and FORWARD on the pair.
  val safety = all {
    C::safety,
    verdict.full == (verdict.backward and verdict.forward),
  }
}
