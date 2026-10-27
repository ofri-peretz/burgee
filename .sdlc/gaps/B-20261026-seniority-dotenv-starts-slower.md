---
id: B-20261026-seniority-dotenv-starts-slower
section: B
status: closed
source: seniority criterion 4 (the spawn rows, D-20261026-seniority-spawn-bars)
recommendation: 'Keep `seniority/dotenv − dotenv` a ratchet at roundel R8''s 10 ms allowance (`SENIORITY_DOTENV` in `benchmarks/axes/perf.ts`) so it cannot grow. Then cut the module count on its start-up path: `dotenv.js` reaches `load.js` and `precedence.js` only for `LoaderError`, and `runtime.js` for two one-line readers. Lower the gate toward 0 as the measured difference falls'
---

`seniority/dotenv` starts slower than dotenv 18.0.8. The paired median was +1.74 ms in one run and +4.88 ms in another (68 interleaved rounds each, M4 Pro, load average 30 to 40, 2026-10-26). `seniority/lilconfig` starts at or under lilconfig in the same runs (−0.19 ms).

The cause is the module graph, not the code. dotenv is one CommonJS file. `seniority/dotenv` loads six ES modules before it prints: `dotenv.js`, `dotenv-options.js`, `dotenv-scan.js`, `load.js`, `precedence.js` and `runtime.js`. Every ES module costs a resolve, a package-scope lookup, a compile and a link, whatever its size (`benchmarks/cold-start-modules.test.ts` measured that cost for burgee). The bundled bytes say the opposite: 5,966 B against dotenv's 11,570 (0.516). A bundler folds the six files into one, and Node's loader does not.

No published claim rests on this row. R9's time bar names lilconfig only, and the README publishes no start-up figure for the `.env` drop-in.

**The first CI reading disagrees.** On the ubuntu runner (Benchmarks run 40259807578, 2026-10-26)
the row read **−15.26 ms**: `seniority/dotenv` started faster than dotenv, and `seniority/lilconfig`
read −1.92 ms. So "slower" is measured on darwin under load and is not yet a property of the
package. This gap closes once three CI readings in a row are at or under 0; until then the ratchet
stays, and the next reading on darwin is the one to compare.

**Closed 2026-10-27, by its own rule: three CI readings in a row at or under 0.** Every CI reading
of `seniority/dotenv − dotenv` `cold-start-delta-ms` landed on `main` since the row existed is
under 0, eleven in a row, by each file's `measured` time (`benchmarks/results/cli-benchmarks/`):

| File | Measured (UTC) | Delta |
| :-- | :-- | --: |
| `2026-10-26-e739f18-ci.json` | 2026-10-26 03:41 | −15.33 ms |
| `2026-10-26-168d85c-ci.json` | 2026-10-26 04:32 | −15.16 ms |
| `2026-10-26-02e6f9f-ci.json` | 2026-10-26 04:50 | −16.01 ms |
| `2026-10-26-c5b5735-ci.json` | 2026-10-26 05:05 | −11.41 ms |
| `2026-10-26-c4230e3-ci.json` | 2026-10-26 05:15 | −0.38 ms |
| `2026-10-26-3d079b1-ci.json` | 2026-10-26 05:26 | −0.22 ms |
| `2026-10-26-8c9c088-ci.json` | 2026-10-26 05:58 | −15.46 ms |
| `2026-10-26-3fa726f-ci.json` | 2026-10-26 06:20 | −15.56 ms |
| `2026-10-26-65a6320-ci.json` | 2026-10-26 06:48 | −15.20 ms |
| `2026-10-26-bc57a47-ci.json` | 2026-10-26 07:11 | −13.80 ms |
| `2026-10-26-8d7126c-ci.json` | 2026-10-26 07:44 | −15.34 ms |

The four readings of 2026-10-27, still in the open `chore/bench-series` PR #1288, agree: −19.22,
−14.81, −0.66 and −13.69 ms. So on the CI runner `seniority/dotenv` starts at or under dotenv. The
darwin readings above (+1.74 and +4.88 ms, under load) were the machine, not the package. Two
readings (−0.38, −0.22 ms) sit near zero, so the row stays a ratchet at roundel R8's 10 ms
allowance (`SENIORITY_DOTENV` in `benchmarks/axes/perf.ts`). That keeps the module-graph cost from
growing, and the recommendation's cut of the module count stays worth doing. It no longer has a
measured slowdown to answer to.
