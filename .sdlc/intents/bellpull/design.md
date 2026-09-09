# Design — bellpull

Intent: [`intent.md`](./intent.md). Umbrella:
[`cli-foundation-stack`](../cli-foundation-stack/design.md). **Status:** draft.

**This design is conditional.** It describes what gets built *if* the intent's kill gate
clears. Nothing here is started before that evaluation is recorded.

---

## Requirements

- **R1** `run(cmd, args?, opts?) → Promise<Result>` where
  `Result = { ok, code, signal, stdout, stderr, duration, command, executable, timedOut }`.
  **A non-zero exit resolves**, with `ok: false`. Rejection is reserved for: executable not
  found, spawn failure, and the deadline.
- **R2 (Y10)** `timeout` is finite by default. On breach: the child is killed (`SIGTERM`,
  then `SIGKILL` after a grace window), `timedOut: true`, and **`stdout`/`stderr` hold what
  arrived before the kill** — discarding partial output is what makes a CI timeout
  undiagnosable.
- **R3 (Y6)** `which(cmd, opts) → { path, from }` where `from` is the `PATH` entry that
  matched. Executability is checked per platform (`isexe`'s job, inlined); on Windows
  `PATHEXT` ordering is honoured and reported.
- **R4** `runPath({ cwd })` returns `PATH` prefixed with every `node_modules/.bin` from
  `cwd` upward — `npm-run-path`'s contract, using `seniority`-style bounded walking logic
  reimplemented locally (Y1 forbids a sibling dependency; it is a dozen lines).
- **R5 (Y5)** One `Result` value, three renderings: `format(result)` for a human,
  `toJSON(result)` for `--json`, `toEvent(result)` for an agent stream. No branch formats
  twice, and the human text is derived from the record rather than assembled alongside it.
- **R6** Shebang handling, argument escaping and `.cmd`/`.bat` resolution follow
  `cross-spawn`'s semantics, because its suite is the grader. `shell` is off by default and
  documented as an injection surface when on.
- **R7 (Y3)** Root default export matches `execa`'s default; `./which` and `./run-path` are
  separately graded subpaths and separate override targets. Subpath isolation locked as in
  `roundel`.
- **R8 (Y8)** Ceilings: bytes and spawn delta at or under **`tinyexec`** (0 deps, 119.5 M/wk)
  — the rival, not `execa`. A ceiling set at `execa` would be a free pass and dishonest.
- **R9 (Y7)** `execa`, `cross-spawn` and `which` suites vendored into `compat-oracle`,
  `--control` first, ratcheting. `execa`'s is the largest compatibility surface in the
  family; a partial pass rate is published as a partial number, never rounded up.
- **R10 (Y9)** Nothing reads `process.*`; `env` and `cwd` arrive as arguments.
- **R11** `duration` is documented as **wall-clock from spawn to close, including Node's own
  scheduling** — not the child's CPU time. Stated in the type's doc comment, because the
  honest caveat is what makes the number usable.

### Evidence

| R | What supports it | Standing |
| :-- | :-- | :-- |
| R1 | `execa` throws on non-zero exit; every wrapper re-implements the same try/catch | measured behaviour |
| R2 | no incumbent bounds spawn by default; same failure shape `closeout` bounds one layer over | **hypothesis until the matrix runs** |
| R3 | `which` 290 M/wk + `isexe` 243.7 M/wk + `path-key` 244.9 M/wk = 779 M/wk; **neither `tinyexec` nor `nano-spawn` resolves** | measured 2026-09-09 |
| R4 | `npm-run-path` 104 M/wk, 2 deps, last publish 2024-08-26 | measured |
| R6 | `cross-spawn` 212.2 M/wk, 3 deps, last publish 2024-11-18 | measured |
| R8 | `tinyexec` 119.5 M/wk, **0 deps**, published 2026-09-03 | measured — **and this is the risk, not the target** |
| the whole design | `execa`: `engines >=22`, 12 direct deps, 16 packages, 1.42 MB | measured |

## Design

```text
packages/bellpull/src/
  run.ts          spawn, collect, the Result                                  (R1)
  deadline.ts     kill ladder + partial output preservation                   (R2)
  which.ts        resolution + the matched PATH entry                         (R3)
  run-path.ts     node_modules/.bin walking                                   (R4)
  project.ts      format / toJSON / toEvent over one Result                   (R5)
  spawn-args.ts   shebang, escaping, PATHEXT — cross-spawn's semantics         (R6)
  runtime.ts      the structural Runtime shape, nine lines, no import         (Y9)
  index.ts        default = execa's default; named re-exports
  matrix.test.ts  exit codes × signals × timeout × missing executable         (R1, R2)
  weight.test.ts  R8 · shape.test.ts  R7, R10
```

**Order.** The kill gate → `which` (the open position, and the smallest thing that is
useful alone) → `run` + `deadline` → `project` → `spawn-args` → `run-path` → vendor the
three suites → switch `compat-oracle` and `cli-benchmarks` to it → B4 rows.

**`which` ships first, and possibly alone.** It is the part of this layer nobody contests:
779 M/wk across `which` + `isexe` + `path-key`, and neither zero-dep rival touches it. If
`run` turns out to be a crowded loser, `./which` still stands as a product, and the gate's
"build on resolution + shape" verdict is honoured by shipping the resolution half first.

**The result is the argument.** `execa` throwing on a non-zero exit means every caller wraps
it, and the wrapper always reconstructs the same fields. Returning them makes the common
case straight-line code and makes the three projections (R5) derivable from one value —
which is rule 6 applied one layer below where it usually lives.

**Dogfooding as the honest test.** `compat-oracle` spawns to grade, `cli-benchmarks` spawns
≥30 times per row. Both switch to `bellpull` before it publishes. That proves the API
against real use; it does not prove demand, and the README will not imply it does.

## Verification

- `npm test -w bellpull` — the matrix (exit codes, signals, timeout with partial output, a
  missing executable, a shebang script, a `.cmd` on Windows), R8's ceiling, R10's shape lock.
- `npm run compat -- execa cross-spawn which` — three rows, `--control` first, ratcheting,
  with `execa`'s partial rate published as-is.
- `npm run compat` and `npm run bench` themselves, **after** the switch, unchanged — the
  dogfooding loop is the acceptance test.
- **The check that would have caught the original problem.** The original problem is a
  subprocess that never returns and takes an unattended run with it. The matrix includes a
  child that ignores `SIGTERM` and never exits; the cell asserts the parent settles within
  `timeout` + grace, that `timedOut` is true, and that output written before the kill is
  present. Run against real `execa` with no timeout set, the same cell hangs — that control
  is checked in, so the check is known to work rather than assumed to.

## Rejected alternatives

- **Competing on weight.** Taken, by a zero-dependency package with 119.5 M/wk published six
  days before this was written. Every claim here is resolution and shape; the README says so
  and names `tinyexec` directly. Pretending otherwise would be the one thing that makes the
  family's measured claims untrustworthy elsewhere.
- **Throwing on non-zero exit, for `execa` parity in the native API.** The façade must throw
  to pass `execa`'s suite; the native API must not, or the differentiator disappears. Two
  behaviours, one clearly labelled boundary.
- **Reimplementing `execa`'s template-literal API (`` $`cmd` ``) as the native shape.** It is
  an ergonomic layer over the same result, and adopting it as the primary API would make
  the result secondary — which is the whole product.
- **Depending on `seniority` for the upward walk in R4.** Y1 permits no sibling edges in the
  foundation. Twelve lines duplicated beats a dependency, exactly as with `contrast`.
- **`shell: true` by default.** Every incumbent that did it regrets it; it is the injection
  surface, and defaults are what people ship.
- **Folding `open` (130 M/wk) in now.** It is structurally this layer, and it drags a
  platform-detection surface behind it. Recorded as an intent open question, deliberately
  not designed here.

## Out of scope

- Streaming as a first-class API, pending the intent's open question. Whatever `execa`'s
  suite grades of it is graded; nothing more is promised.
- Process pools, job queues, concurrency limiting. One call runs one program.
- Killing or supervising processes this package did not start; and ending the *current*
  process, which is `closeout`.
- IPC, `fork`, and worker threads. Different contracts, different suites, no measured layer.
