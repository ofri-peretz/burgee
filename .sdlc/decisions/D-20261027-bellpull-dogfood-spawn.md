---
id: D-20261027-bellpull-dogfood-spawn
subject: 'bellpull criterion 4 says compat-oracle and the benchmarks spawn through bellpull, "their suites unchanged". Which bellpull API do they spawn through, how does the oracle load it when vendor-suite.ts must start from a checkout with nothing installed, and where does the execFileSync shape live?'
taken: 'Taken by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-27, in feat/bellpull-dogfood-spawn'
date: '2026-10-27'
superseded_by: —
---

**`bellpull/cross-spawn`, not `run`. One small module per workspace (`packages/compat-oracle/src/spawn.ts`
and `benchmarks/spawn.ts`) exports `spawnSync`, `spawn` and `execFile` over it, and nothing else in
either tree imports `node:child_process` (`scripts/dogfood-spawn-lock.test.ts`). The oracle loads
bellpull on its first spawn, through `createRequire`, and the benchmarks import it statically.**

**Why `cross-spawn` and not `run`.** Every call site is synchronous, and several sit
inside a timed region (B2's `perf.ts`, `scale.ts`) or a `catch` that reads `status`, `stdout` and
`stderr` off a thrown error (`run.ts`'s three runners). `run` is asynchronous and returns a
result, so moving onto it would rewrite each caller's control flow and every timing around it, and
"their suites unchanged" could not be shown by diffing a single number. `bellpull/cross-spawn` is the
drop-in path. On POSIX it is a pass-through to `node:child_process` after normalising the
arguments: measured on an M4 Pro, `_parse` costs 0.50 µs a call against a 22.3 ms `node -e ''`,
and a spawn through it has a median of 22.35 ms against 22.30 ms raw (30 each, interleaved). Both
sides of every ratio pay that cost once per spawn. On Windows it is the reason `npm` starts at all.

**`execFile` is Node's `execFileSync`, rewritten over `crossSpawn.sync`.** The same return value;
the same throw on a failure to start or a non-zero exit, with `pid`, `output`, `stdout`, `stderr`,
`status` and `signal` assigned onto the error; the same `Command failed: <file> <args>` message
with stderr appended; and the child's stderr echoed to ours when the caller did not choose `stdio`.
`spawn.test.ts` in each tree pins each of those against a real child. bellpull exports no
`execFileSync`, and it should not: `bellpull/cross-spawn` is graded as a drop-in for `cross-spawn`,
whose surface has none. Adding one would be a new public API in a published package to save
private tooling twenty lines.

**Two copies, on purpose.** `benchmarks/` does not import from outside itself (`scratch-dir.ts`
is a copy of the root's for the same reason), and `oracle-import-lock.test.ts` refuses a bare
`compat-oracle/…` import there. The copies differ in one line, which is the next paragraph.

**The oracle's load is deferred, and the cost is stated.** `scripts/vendor-suite.ts` imports
`vendor.ts` and `upstream.ts` by path and must load from a checkout with nothing installed
(`scripts/vendor-suite-resolution.test.ts`, which still passes). A static
`import 'bellpull/cross-spawn'` fails there with `Cannot find package` before the script prints
its usage. So `spawn.ts` calls `createRequire(import.meta.url)('bellpull/cross-spawn')` on each
spawn. `require()` of ESM is synchronous on every Node in `engines`, so no call site became
asynchronous, and Node caches the module after the first call. The type import is `import type`,
because under `verbatimModuleSyntax` the inline `import { type … }` form compiles to
`import {} from 'bellpull/cross-spawn'`, a static load. **The cost:** a vendor run from a tree
where `bellpull` cannot be resolved at all now fails at its first `git` call, where it used to
run to the end. Every real vendor run (`compat-refresh.yml`, `compat-upstream.yml`, `npm run
compat -- --vendor`) builds the packages first, and the test that pins "loads with nothing
installed" still holds.

**What this removes.** `upstream.ts`'s `npmOn()`, which chose `npm.cmd` and `shell: true` by hand
on `win32` (#1180). That was a second copy of bellpull's job, and the shell existed only to start a
`.cmd`. The three `suiteDeps` end-to-end suites (`tsd` in `run.test.ts`, `twist.test.ts`,
`uvu.test.ts`) were skipped on Windows because `installSuiteDeps` ran a bare `npm` through
`execFileSync`. They run there now, and that is the Windows evidence: `compat.yml`'s
`windows-latest` cell runs them whenever `compat-oracle` is affected.

**Out of scope, left as it was.** Test files: several spawn with `node:child_process` precisely to
be independent of what they test. `compat-oracle/src/__fixtures__/scratch-dir.ts`, test scaffolding
that `tmpdir-cleanup-lock.test.ts` holds byte-identical to every other package's copy, so it
cannot move alone. `benchmarks/fixtures/` holds the measured programs. A raw-spawn
floor is a legitimate thing to time. `scripts/` is not one of the two consumers the criterion
names.
