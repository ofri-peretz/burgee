---
id: D-20261007-revendor-execa-dotenv
subject: 'execa 10.1.0 (#843) and dotenv 18.0.6 (#844) were released: what did the oracle need to grade them, and what did `seniority/dotenv` need to stay level?'
taken: Taken
date: '2026-10-07'
superseded_by: —
---

**execa: re-vendored at 10.1.0, control 1180 / 1180 on the ratchet's ubuntu runner (1179 / 1179 on an arm64 Mac), `bellpull` 0 / 1180, still a published ceiling. dotenv: re-vendored at 18.0.6, control 181 / 181, `seniority` 181 / 181, still level.** Measured on darwin arm64, Node 24.13.0, 2026-10-07, and on the PR's ubuntu ratchet; the ubuntu run is the published one.

**execa 10.1.0 moved its suite from ava to `node:test`.** Upstream's `npm run unit` is now `node --test --test-concurrency=1 --test-timeout=240000 "test/!(fixtures|helpers)/*.js"`, and `ava` left its devDependencies. The `execa` row follows it:

- `runner: 'node:test'` with `testConcurrency: 1`, in place of `avaConfig: { timeout: '240s', concurrency: 1, workerThreads: false }`, which said the same thing to ava.
- `timeoutMs: 240_000`, and the `node:test` arm now passes a host's `timeoutMs` as `--test-timeout`. Before this, `timeoutMs` reached mocha only; node:test has no per-test timeout unless asked, so a case upstream fails for hanging would have run to the whole-suite cap and passed. No other `node:test` row sets `timeoutMs`, so no other row's command line changes. `grade.test.ts` holds it with a 1.5 s case under a 300 ms timeout; it was red with the arm reverted. Node tallies a timed-out case as `# cancelled`, not `# fail` — it is simply not a pass, which is all the grade counts.
- `suiteDeps`: `execa@10.1.0`, `ava` removed, `c8@12.0.0` added. `arguments/local.js` proves `preferLocal` by running a devDependency's bin with `PATH` stripped of it — `ava` at 10.0.1, `c8` at 10.1.0 — so `c8` has to be in `vendor/execa/node_modules/.bin`. Without it the darwin control read 1176 / 1179, the three `preferLocal` cases failing on `spawn c8 ENOENT`.
- The `fixtures/` and `helpers/` reasons now cite upstream's own glob rather than ava's convention. The nine directories left ungraded for cost are unchanged; the 647 s measurement that keeps them out is still 10.0.1's.

The upstream check named 144 test titles added and 4 removed; the counted cases moved 1048 → 1180.

**One case registers by CPU, not by platform, so `conditionalCases` learned `arch`.** `return/early-error.js` registers `write to fast-exit subprocess` inside `if (!isWindows)` and then `if (arch() === 'x64')`. The first ubuntu ratchet counted 1180 against a reference of 1179 recorded on an arm64 Mac, and refused it, as it should. The reference is the full set, 1180, and the row declares `{ count: 1, notOn: ['win32'], arch: ['x64'] }`. `arch` only narrows a platform clause; `absentHere` and `absentPassing` take the CPU as a third argument, defaulting to `process.arch`, and the compatibility page prints `not on win32, and only on x64`. A platform-only declaration (`only: ['linux']`) would have made both CI machines right and an Intel Mac wrong, against a guard that never mentions Linux. `gate.test.ts` holds it, red before the field existed. `passing` is omitted: `bellpull` fails the case where it runs. The zero is still a link-time zero (`does not provide an export named 'execa'`), and still the whole suite's: run over all 152 files at 10.1.0, `bellpull` passed none. Nothing about the row's status changes — bellpull ships no execa API and will not (bellpull spec R7).

The root `execa` devDependency moves `^10.0.0` → `^10.1.0` (lockfile: the one `execa` entry and its two dependency ranges, both already satisfied by the hoisted `pretty-ms` 9.3.1 and `yoctocolors` 2.2.0), because `capabilities-lock` requires the installed incumbent to be the graded release. Three of bellpull's capability cells quoted 10.0.1's `command-file.js`; 10.1.0 rewrote it (arguments are now quoted the BatBadBut way instead of double-escaped), so they are re-quoted from 10.1.0. No cell's status moved: execa still escapes for `cmd.exe` and refuses CR/LF, still uses no shell unless asked, and off Windows still leaves `PATH` to the operating system.

**dotenv 18.0.6 changed one thing: `populate` reads `override` and `debug` through `parseBoolean`, not `Boolean` (motdotla/dotenv#1069).** The string `'false'` (and `'0'`, `'no'`, `'off'`, `''`, any case) is now off; it was truthy. The two new cases (`test-populate.js`) assert exactly that. `seniority/dotenv`'s `populate` used `Boolean` too and read 179 / 181; it now uses `truthy`, the port of `parseBoolean` that `config` and `dotenv run` already shared (`dotenv-options.ts`). Its unit tests were red first. Upstream's types still say `boolean`, and so do ours: this is a runtime behaviour for callers whose options came from a string, not an API change.

**For the owner.** `seniority`'s changeset is a `patch`: a caller passing `{ override: 'false' }` used to get an override and now does not. That is dotenv's own behaviour at 18.0.6, released by dotenv as a patch, and the drop-in follows its incumbent's current release.
