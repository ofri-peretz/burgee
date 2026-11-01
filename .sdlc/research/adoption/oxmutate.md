# Adoption report: `oxmutate` on burgee

Intent [`first-adopter`](../../intents/first-adopter/spec.md), A2. Written 2026-11-01 by the
session that built oxmutate. That session did not build burgee.

**oxmutate is the first package whose command line was written on burgee from its first
commit, rather than migrated from commander or yargs.** It has no incumbent CLI, so there is no
revert branch. A3 applies to [concurrently](concurrently.md), not here. What this report can
measure is what a new tool pays to sit on burgee, and what broke while it did.

## When and how

|                           |                                                                                              |
| :------------------------ | :------------------------------------------------------------------------------------------- |
| First commit with the CLI | `5d9bbadf61`, 2026-10-27 01:58 +02:00: `cli.ts` 146 lines, `bin.ts` 6                        |
| CLI changes before merge  | 4 commits, all 2026-10-27 (`80e421afb3` → `ceb3a033e5`)                                      |
| Merged                    | ofri-peretz/burgee#1302, 2026-10-28 16:01Z, squash `c6c7413d1b`                              |
| Published                 | `oxmutate@1.0.0`; 1.1.0 is current, with `burgee ^1.9.2` (1.9.4 resolved in a fresh install) |
| burgee API used           | `defineProgram`, `defineCommand`, `run`, `ExitCode`, and the `burgee.text` symbol            |

`bin.ts` is `await run(program)`. `cli.ts` declares two commands: `run`, declared
`idempotent`, and `survivors`, declared `read_only`. Each handler returns data, and the
text a person reads rides on the `burgee.text` symbol. `child.ts`, the warm Vitest server,
imports `ExitCode` only for its exit calls.

**Time.** No separate time log was kept for the CLI. It was written with the engine, inside
the same 2026-10-27 session. The CLI did not hold up the merge or a release. The release delays
(1.0.0 waited a day) came from npm trusted publishing and the native-core build, not from burgee.

## Diff size

- **burgee-facing lines:** 46. That is 36 in `cli.ts`, 2 in `bin.ts` and 8 in `child.ts`:
  imports, declarations, `effects`, `examples` and `ExitCode` uses.
- **CLI files in total:** `cli.ts` 164 lines, `bin.ts` 6.
- **For scale:** #1302 was +14,017 / −209 across 254 files. The CLI is about 1.2% of it.
- **Files the CLI touched after the merge:** none. #1364 and #1374 changed `child.ts`'s
  Vitest handling, not its use of burgee.

## What a caller gets for those lines

Checked against the published `oxmutate@1.1.0` on 2026-11-01:

- **`--schema`** prints the program schema, with the exit-code table, and exits 0.
- **`--json` failure** (`survivors --report /nonexistent.json --json`):
  - stdout carries `{"ok":false,"error":{"kind":"runtime","code":1,"message":"… fix: run
\`oxmutate run\` first","usage":{…}}}`, and the process exits 1;
  - stderr carries the one clispec R6 line.
- **`--mcp`** answers `initialize` and `tools/list`. The `effects` declarations become MCP
  hints: `run` is `idempotentHint: true` and not read-only, and `survivors` is
  `readOnlyHint: true`.
- **The rest:** help, completions and `--format=agent` came with the declaration. oxmutate
  wrote no code for any of them.

## Breakages

1. **`--break` never failed a run (fixed before merge, `8c72f54515`, 2026-10-27).**
   - The handler set `process.exitCode = 1` through oxmutate's own runtime seam, and returned
     its data.
   - burgee takes the exit code from the returned data (`exitCode` on the result, as
     `check.ts` documents) and wrote 0 over it, without saying so.
   - oxmutate's e2e test for a score below the threshold caught it the same day. Both
     non-zero paths, `--break` and the frozen oracle, now set `data.exitCode`.
   - **Gap: none filed.** Nothing tells a handler that the code it set was overwritten.
     **Proposed:** in development, burgee warns when a handler leaves a non-zero
     `process.exitCode` that differs from the one it is about to set.
2. **1.0.0 published `burgee` and `bellpull` as `"*"` (fixed in 1.0.1, #1350, 2026-10-28).**
   - The workspace dependency ranges were published as written.
   - Not a burgee API problem, but every family package that depends on burgee can do it.
     `scripts/package-shape-lock.test.ts` now refuses any published dependency that is not
     `^x.y.z`.
   - **Decision:** [D-20261028-oxmutate-sc6-family-deps-bundled-cores](../../decisions/D-20261028-oxmutate-sc6-family-deps-bundled-cores.md).

## Friction

1. **The text symbol has no export.**
   - burgee defines `TEXT = Symbol.for('burgee.text')` in `src/render.ts:18`, but `index.ts`
     does not re-export it. oxmutate looks it up by the registry string.
   - That works only because it is a `Symbol.for` key. A rename on burgee's side would
     silently drop oxmutate's text output to the JSON fallback.
   - **Gap: none filed.** **Proposed:** export `TEXT`, or a `withText(data, fn)` helper.
2. **`ExitCode` is only on the root entry.**
   - `child.ts` imports `burgee` only for `ExitCode.OK`. Loading the root entry costs
     121–139 ms (3 cold imports, Node 24.12, Apple-silicon laptop under load, 2026-11-01).
   - Every Vitest server oxmutate spawns pays it. That includes each server re-spawned after
     a watchdog kill: 1,142 of them on caique's 2026-10-31 run.
   - This is a cost for SC8. A `0` literal would remove it, but burgee's E1 says no other
     literal may reach `process.exitCode`.
   - **Related gap:** [A-20261009-burgee-cold-start](../../gaps/A-20261009-burgee-cold-start.md)
     (open). **Proposed:** a dependency-free `burgee/exit-code` subpath.
3. **Option types were inferred, but the adopter didn't know.**
   - `cli.ts` casts `options as Record<string, unknown>` and narrows each flag by hand
     (`overridesFrom`).
   - burgee infers the types (`InferOptions`): a probe on 2026-11-01 type-checks
     `options.since` as `string | undefined` and `options.concurrency` as
     `number | undefined` with no cast.
   - The casts are oxmutate's mistake. Removing them is a follow-up in oxmutate, not a burgee
     change.
   - **Gap: none.** It is a documentation signal: the first thing an adopter types after
     `options.` should show the inferred type in the guide.
4. **D-140's text no longer matches the behaviour.**
   - [D-140](../../decisions/D-140.md) says stderr "stays empty under `--json`". burgee now
     writes one `{"error":{kind,code,message}}` line there, deliberately: clispec R6, held by
     `json-failure.test.ts`.
   - Reading D-140, an adopter expects silence.
   - **Gap: none.** **Proposed:** a newer decision that supersedes D-140's stderr sentence.
5. **A non-zero exit that carries data has to be a field on the data.**
   - The `run` handler has to return its full report on a failing threshold, so it sets
     `data['exitCode']` on an untyped record instead of calling `exit()`.
   - It works and is documented in `check.ts`. But it is the convention behind breakage 1,
     and the handler's return type does not show it.
   - **Gap: none.** **Proposed:** have `CommandContext` offer a `fail(code)` that keeps the
     returned data, or type `exitCode` on the return.

## What did not need burgee to change

- Two commands, twelve options, examples, effects, `--json`, `--schema`, MCP and a
  stdout/stderr split that CI and agents read. Nothing in burgee was patched or worked around
  for oxmutate to ship.
- The only workaround in oxmutate's code is the registry-string lookup in friction 1.
