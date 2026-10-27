---
id: D-20261027-native-engine-design-accepted
subject: 'native-engine: is the Stage 2 design accepted, and is any layer ported to Rust now that `M0` has measured `migrate` and the argv core?'
taken: 'Accepted, with no layer ported — by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-27'
date: '2026-10-27'
superseded_by: —
---

**Accepted. [`native-engine/spec.md`](../intents/native-engine/spec.md) is the design any native
layer is built to, and the intent moves `draft → approved`. No layer is ported in this
decision: the two layers measured both fail the 2x port gate of
[`D-20261020-native-engine-order`](./D-20261020-native-engine-order.md), so `burgee migrate` and
the argv core stay JavaScript.**

**What `M0` measured** (2026-10-27; re-run by `.sdlc/intents/native-engine/m0/reproduce.sh`):

- **`migrate` on oxc works.** A Rust binary on oxc 0.156 rewrote specifiers in every position
  `migrate.ts` reads, and 701 of 701 rewritten files are byte-identical to the JavaScript
  build's, across the five field-trial projects, docusaurus, typeorm and A10's 1,000-file tree. No
  file was rewritten by one engine only. On the CPU part it is 3.4–5.0x faster.
- **It does not pay.** That CPU part is 0.6–8.0 ms of a 90–135 ms command on the field-trial
  projects. Measured load-coherently (`gate.mjs`, 7 rounds), the projected whole-command speedup
  is **1.00x** on their median. The ceiling, with zero-cost native work, is **1.08x**, and
  1.93x on typeorm (3,625 files). The rest is Node's start-up, the CLI's module load, `git status`
  and file I/O. Rust with 8 threads reads files no faster than Node's batched async reads.
- **The argv core is microseconds of work in a module-loading process.** At 300 commands,
  burgee's own parse, dispatch and render are 1.6, 6.0 and 4.5 ms (dispatch, `--help`,
  `--schema`). Module loading is 71–87% of each run. This confirms D-20261020's expectation.
- **The other two candidates are not measurable today.** tsrs is `0.20.0-ts7.1.0-beta`, so
  D-20261020 §2's stable-7.1 gate is not met. Single-binary distribution is language-free, and
  measuring it needs Node's SEA tooling (R9).

**What is accepted as design, for the first layer that passes:** spec R1–R11.

1. **The port gate** (R1): a projected median of at least 2.0x on the user's own number, every
   term measured in one round.
2. **Opt-in only** (R2): `burgee-native`, never a dependency of `burgee`, so the default install
   is byte-for-byte unchanged.
3. **One prebuilt package per platform, as `optionalDependencies`** (R3): eight targets, `os`,
   `cpu` and `libc` set, published from this repo with provenance, and no postinstall.
4. **A binary for a tool** (R4): one spawn per run, one JSON document back, and every rule
   still in JavaScript.
5. **The JavaScript build as the complete fallback** (R5): one test per failure mode.
6. **Graded by the same suites plus the `M0` differential** (R6).
7. **A per-platform size ratchet** (R8), seeded at 0.91 MB for darwin-arm64.
8. **A CI ceiling of 20 minutes per release** (R10), and no Rust toolchain in CI until a port
   passes R1.

**Two readings of the principles, recorded so they are not re-argued:**

- **Rule 2 (zero external dependencies) holds at the npm graph and is extended to the crate
  graph, not waived.** The platform packages have no npm dependencies and come from this repo,
  so rule 2's text holds. But the binary statically links 76 third-party crates (oxc's eleven,
  ICU segmentation, serde, phf and others), and rule 2's reason is "one supply chain to audit".
  So the crate graph is pinned by a committed `Cargo.lock`, gated by `cargo deny` (licences,
  advisories, crates.io only), and its count is ratcheted like a weight (R7). PRINCIPLES.md
  lives outside this repo. If the owner wants rule 2's text to say this, that is a one-line
  edit there, and this decision is its evidence.
- **Rule 9's WASM fallback applies only where it gains a platform** (R11). For a layer whose
  JavaScript build is complete, the JavaScript build is the fallback. A WASM build would be a
  third implementation for no platform gained.

**Alternatives rejected** (spec § Rejected alternatives):

- **Port `migrate` anyway.** Rule 4 and D-20261020 both forbid it: it would cost 0.91 MB per
  platform and 76 crates for no measured win.
- **A whole-command native `migrate`.** npm still starts its `bin` through Node, so Node's
  start-up and the CLI's load would stay, and it would mean a second implementation of rules the
  oracle grades.
- **A napi addon.** Rule 9 says a tool gets a binary, not an in-process addon.
- **The npm `oxc-parser` binding.** It is a third-party npm dependency, which rule 2 forbids.
- **Parallel I/O in Rust.** Measured level with Node.

**What remains before `shipped`** (intent criterion 1, "every candidate layer measured, port or
drop"):

1. **The CI type-check lane on tsrs.** It is measured when tsrs releases stable against TypeScript
   7.1: 10 runs beside `tsc` with identical diagnostics, per D-20261020 §2.
2. **Single-binary distribution.** It is measured against Node's SEA, `bun build --compile` and
   `deno compile` on B2, in its own intent (R9).
3. **A port-or-drop decision for each.** If either ports, criteria 2–4 apply to that layer
   through R2–R10, and it ships when its platform packages are published and installed on each
   target in a CI matrix. If neither ports, the intent ships on criterion 1, with criteria 2–4
   recorded as "no layer ported" in that decision.

**Reopens if** a re-run of `reproduce.sh` puts the field-trial median ceiling for `migrate` at
2x or more, or if a Z5-scale B2 profile puts the argv core's own code above half of a cold
`--help`.
