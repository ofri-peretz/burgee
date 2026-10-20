---
id: D-20261020-native-engine-order
subject: 'native-engine (the roadmap''s last intent): which layer is measured first, when tsrs is trusted, whether single-binary needs Rust, and what the Rust CI matrix may cost'
taken: Taken
date: '2026-10-20'
superseded_by: —
---

**Measure `burgee migrate` first, then the CI type-check lane on tsrs. Single-binary
distribution is measured against non-Rust options before any Rust is written. The argv core
is measured last and is expected to stay JavaScript. Nothing starts before every other intent
has closed.**

1. **First layer: `migrate`.** It is the only candidate with the profile where native pays,
   per `.sdlc/research/native-when-it-pays.md` §1. It parses and rewrites every file of a
   project in a short-lived process, which is oxc's own case. The measure is wall time on the
   field-trial projects (wait-port, madge, tsc-alias, qrcode, svgo), JS against an oxc-parser
   prototype. Below a 2× win on the median, it stays JavaScript.
2. **tsrs is not adopted before its stable release against TypeScript 7.1.** On 2026-10-20 it
   targets TypeScript's main branch and marks its Node API unstable. When it reaches 7.1, the CI
   type-check and tsd lanes run tsrs beside `tsc` for 10 green runs. They switch only if the
   diagnostics match exactly and the lane gets faster.
3. **Single-binary distribution is measured against Node's single-executable applications
   and `bun build --compile` / `deno compile` first.** Rule 9 says the win is language-free,
   so Rust is written for it only if none of those meets the B2 target.
4. **The Rust cross-compile matrix gets a CI-minutes ceiling when the first port is
   accepted.** That ceiling is set from the first spike's measured minutes. Until then, no
   Rust toolchain is added to CI.

The argv parser and dispatch are measured last. They are expected to stay JavaScript: the
JS–native boundary costs more than the microseconds of work (§3), and a per-platform `.node`
binary of megabytes would undo the 24.5 KB core bundle's B4 claim. A measurement that says
otherwise reopens this decision.
