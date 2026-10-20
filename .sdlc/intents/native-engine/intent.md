# Intent — `native-engine`: burgee's CPU-bound layers on a Rust engine, still installed from npm

> Opened from the owner's prompt on 2026-10-20 after oxc-project/tsrs, a Rust port of the
> TypeScript 7 checker shipped on npm (`tsrs`, with `@tsrs/wasm` as its WebAssembly build).
> This is the last item on the roadmap. It starts only after every other intent is shipped
> or dropped.

**Status:** draft · **Opened:** 2026-10-20 · **Owner:** @ofri-peretz

---

## What is wanted

Each burgee layer where a native engine measurably beats JavaScript runs on a Rust engine,
and it is still installed with `npm install` and loaded with the same `import` and `require`.
It ships the way PRINCIPLES rule 9 and `.sdlc/research/native-when-it-pays.md` describe:

- one prebuilt package per platform, as optional dependencies, from this repo;
- a WASM fallback;
- no postinstall compile;
- graded by the same incumbent suites as the JavaScript build;
- behind its own opt-in, size-ratcheted package.

The JavaScript build stays the default wherever the native one does not win on the user's
own number.

## Why now

It isn't now. It is recorded now so it gets scheduled, and it runs last.

The trigger is tsrs (oxc-project, first commit 2026-10-01, about 800 stars on 2026-10-20). It
is a TypeScript checker ported to Rust and distributed through npm. It shows the shape rule 9
asks for, in our own toolchain's ecosystem: a Rust core, an npm package, a WASM build.

What we already know, from `native-when-it-pays.md`:

1. **Native pays for CPU-bound volume in a short-lived process.**
2. **The JS–native boundary is the cost.**
3. **Native bytes are paid by every install.**

That points at these layers. Each must be measured before it is designed.

| Layer                                           | Why it may pay                                                                      | Why it may not                                                                                                                                                                   |
| :---------------------------------------------- | :---------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `burgee migrate` (codemod)                      | It parses and rewrites every file of a project, which is volume, oxc's own profile. | It runs once per project, so a slow run is minutes once, not a daily cost.                                                                                                       |
| compat-oracle and CI tooling                    | Our CI is bound by queue and CPU, and a type-check lane could run on tsrs.          | That is tooling, not product. tsrs's Node API is marked unstable, and its PRs are closed.                                                                                        |
| single-binary distribution of a user's program  | Rule 9 calls it the largest latency win: their users need nothing installed.        | It is language-free. It may not need Rust at all.                                                                                                                                |
| the argv parser and dispatch (the runtime core) | Help and manifest at hundreds of commands.                                          | Parsing argv is microseconds. The boundary crossing costs more than the work. A `.node` binary is megabytes per platform, against a 24.5 KB core bundle, so B4 and B2 get worse. |

## Affected users and systems

- burgee's packages and their published B2 (cold start) and B4 (weight) rows.
- The release pipeline: per-platform builds, a WASM target, provenance for each artifact.
- CI: a Rust toolchain, and cross-compilation for at least darwin, linux and win32 on x64
  and arm64.
- The docs' weight and benchmark pages, which gain a native column beside the JS one.

## Constraints

- **Zero runtime dependencies stays true.** The per-platform packages are our own optional
  dependencies from this repo, never a third-party native module.
- **The same suites:** commander 1,360/1,360, yargs 816/816, and every graded host stays
  at its current grade on the native build.
- **No regression for anyone who doesn't opt in.** The default install's bytes and cold
  start do not move.
- **No postinstall step** and no compiler on the user's machine.
- **The fallback must be complete:** a platform with no prebuild gets WASM or JS, never an
  error.

## Success criteria

1. Every candidate layer is measured, JS against a native prototype, on the user's own
   number (B2 or the layer's wall time). The result is recorded as a decision: port or
   drop.
2. Each ported layer publishes B2 and B4 rows for the native build beside the JS build,
   with the same compat pass rates.
3. `npm install` on each prebuilt platform loads the native engine with no postinstall,
   and on any other platform it falls back to WASM or JS. A CI matrix job proves both.
4. The opt-in package has a size ratchet, and the default package's bytes are unchanged.

## Open questions

- ~~Which layer to measure first.~~ Decided (D-20261020-native-engine-order): `migrate`, then
  the CI type-check lane on tsrs, with the argv core last.
- ~~Whether tsrs is stable enough to grade our types in CI.~~ Decided
  (D-20261020-native-engine-order): not before its stable 7.1 release, then 10 green runs
  beside `tsc` with identical diagnostics.
- ~~Whether single-binary distribution needs Rust.~~ Decided (D-20261020-native-engine-order):
  measured against Node single-executable applications and bun/deno compile first.
- ~~What the Rust cross-compile matrix costs in CI.~~ Decided (D-20261020-native-engine-order):
  no Rust toolchain in CI until a port is accepted, then a CI-minutes ceiling set from the
  first spike.
