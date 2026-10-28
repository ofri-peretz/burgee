---
id: D-20261028-native-engine-dropped
subject: 'native-engine: with `migrate` and the argv core measured below the 2x gate, and the two other candidates not native-engine work we can do, is the intent closed?'
taken: 'Dropped — by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-28'
date: '2026-10-28'
superseded_by: —
---

**Dropped. No burgee layer ports to Rust, and burgee stays JavaScript.
[`native-engine`](../intents/native-engine/intent.md) closes as `dropped`, not `shipped`: it was
opened to put CPU-bound layers on a Rust engine, and none of the layers it can measure wins.**

**What was measured** (`M0`, 2026-10-27, re-run end to end by
`.sdlc/intents/native-engine/m0/reproduce.sh`; numbers in
[`spec.md`](../intents/native-engine/spec.md) § `M0` results and `m0/results/summary.md`):

- **`burgee migrate`.** A Rust engine on oxc 0.156 matched the JavaScript build on 701 / 701
  rewritten files and ran the CPU part 3.4–5.0x faster. That part is 0.6–8.0 ms of a 90–135 ms
  command on the five field-trial projects. Measured in one round per sample (`m0/gate.mjs`, 7
  rounds), the field-trial median projects to **1.00x**, with a **1.08x** ceiling if native work
  cost nothing. [`D-20261020-native-engine-order`](./D-20261020-native-engine-order.md) §1 ports
  only at 2x. It stays JavaScript.
- **The argv parser and dispatch.** At 300 commands, burgee's own parse, dispatch and render are
  1.6, 6.0 and 4.5 ms (dispatch, `--help`, `--schema`). Module loading is 71–87% of each run. A
  native parser could remove at most about 6 ms before paying its own load. It stays JavaScript.

**Why the two rows left `waiting` do not keep the intent open.** Neither is native-engine work
that can be done here.

- **The CI type-check lane on tsrs** waits on someone else's release. tsrs is
  `0.20.0-ts7.1.0-beta` on 2026-10-27, and D-20261020 §2 trusts it only from its stable release
  against TypeScript 7.1. It is also CI tooling, not a burgee layer: adopting it would put no
  Rust in anything burgee ships.
- **Single-binary distribution** is "not a Rust question" (spec R9, rule 9: the win is
  language-free). It is a build step for a user's program, measured against Node's
  single-executable applications and `bun build --compile` / `deno compile` first
  (D-20261020 §3), so it belongs to its own intent.

With no layer ported, intent criteria 2–4 (native B2 / B4 rows, the prebuild and fallback CI
matrix, the opt-in package's size ratchet) have nothing to apply to. This replaces the closing
path in [`D-20261027-native-engine-design-accepted`](./D-20261027-native-engine-design-accepted.md)
§ "What remains before `shipped`", which kept the intent open until both waiting rows were
measured. That decision's design, spec R1–R11, stays the design any future port is built to.

**No Rust toolchain entered CI.** D-20261020 §4 and spec R10 held it out until a port passed R1,
and none did. `.github/` has no Rust, cargo or cross-compile step, and nothing was published:
`m0/spike/` is `publish = false` and outside every npm workspace.

**Reopen triggers.** Each is concrete and checkable, and each says what it opens.

1. **tsrs publishes a stable 7.1 release** (`npm view tsrs version` has no pre-release tag and
   targets TypeScript 7.1). Then open a new intent for the tsrs CI type-check lane under
   D-20261020 §2: 10 green runs beside `tsc` with identical diagnostics, and it switches only if
   the lane also gets faster.
2. **Single-binary distribution gets its own intent** (Node SEA, then `bun build --compile` and
   `deno compile`), measured there on B2 for one example program. Reopen `native-engine` only if
   that measurement shows a Rust engine at 2x or more on the user's number against the best of
   those.
3. **A future measurement shows any layer's CPU share large enough that a native port projects
   2x or more** on B2 or on that layer's wall time, by spec R1's formula with every term measured
   in one round. For `migrate`, that is a `reproduce.sh` re-run whose field-trial median ceiling
   reaches 2x. For the argv core, it is a B2 profile where burgee's own code is more than half of
   a cold `--help`.

**What stays.** `m0/` stays as the evidence and the starting point for trigger 3: the spike crate,
the byte differential (`m0/compare.mjs`) and `reproduce.sh`. The argv core's module-loading cost
at 300 commands is a JavaScript entry-graph question, recorded in spec § Out of scope, and is not
reopened by this decision.

**Intent.** [`native-engine`](../intents/native-engine/intent.md) is dropped by this decision.
