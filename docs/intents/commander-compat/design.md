# Design — `commander-compat`

Intent: [`intent.md`](./intent.md). **Status:** review.

---

## Requirements

| id | Requirement |
| :-- | :-- |
| X1 | `banneret/commander` exposes commander's public surface (151 methods) over `cli-core` |
| X2 | The vendored commander suite (1215 tests) runs against it through `compat-oracle`'s shim, unedited |
| X3 | The pass rate is published per release and ratchets (C5) |
| X4 | Divergences are registered in `excluded.json` with a reason and an asserting test (C4) |
| X5 | A fixture importing only `banneret` pulls zero bytes of this front-end (B4) |
| X6 | `core + this front-end` stays under 232KB bundled |
| X7 | `examples/demo-cli-commander` produces byte-identical output against real commander and this front-end |

## Design

commander's public shape is a `Command` class with `createCommand()` as the subclass hook, plus `Option`, `Argument` and `Help`. The front-end reproduces that shape and translates each
call into `cli-core` primitives; it holds no parsing logic of its own.

Host quirks — `-abc` bundling, `--no-` negation, variadic arity, `allowUnknownOption`, `passThroughOptions`, `enablePositionalOptions` — are composed from
`banneret/quirks/*` (see [`replacement-parser`](../replacement-parser/design.md) G3), so
this front-end is a *selection* of behaviours plus a naming shim, not a second
implementation. That is what keeps X5 and X6 achievable: the quirks are shared with the
other front-end wherever the two hosts happen to agree.

**Order of work, driven by the oracle.** Start with every test failing and burn the
number down; the suite is the backlog and its pass rate is the progress bar. Take the
files in ascending order of failures so the rate moves early and the shape of the
remaining work stays visible. Each commit reports the new rate in its message, so
`git log` is the burn-down chart.

## Verification

`COMPAT_TARGET=banneret/commander npm run compat` — the loop, exiting non-zero below baseline.

Proven-red, per rule 4: the first commit registers the front-end as a `COMPAT_TARGET`
with an empty implementation and records the resulting near-zero baseline. Every
subsequent commit raises it. A gate whose first recorded state is green proves nothing.

X7 is a separate check: `examples/conformance` runs the demo against both
implementations and diffs stdout byte for byte, which catches formatting drift that a
pass/fail suite tolerates.

## Rejected alternatives

- **A separate npm package.** Subpath exports version with the core, so a user cannot
  install a front-end that disagrees with the parser it wraps.
- **Writing our own compatibility tests.** They would encode our reading of commander, which is
  the thing under test. See `compat-oracle`'s rejected alternatives.
- **Runtime compatibility mode.** Ships both front-ends to every user. §6 of the
  competitor map.
- **Reimplementing the quirks privately here.** The two hosts agree on more than they
  disagree on; duplicating the shared parts doubles both the bytes and the bug surface.

## Out of scope

- commander's internals. The 9 upstream files testing `../lib/` are excluded by
  `compat-oracle` R3, and nothing here promises them.
- Deprecating `commander-agent`. It remains the recommended entry for anyone already on real
  commander, which is most of the addressable market.
