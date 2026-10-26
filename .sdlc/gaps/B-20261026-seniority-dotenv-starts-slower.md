---
id: B-20261026-seniority-dotenv-starts-slower
section: B
status: open
source: seniority criterion 4 (the spawn rows, D-20261026-seniority-spawn-bars)
recommendation: 'Keep `seniority/dotenv − dotenv` a ratchet at roundel R8''s 10 ms allowance (`SENIORITY_DOTENV` in `benchmarks/axes/perf.ts`) so it cannot grow. Then cut the module count on its start-up path: `dotenv.js` reaches `load.js` and `precedence.js` only for `LoaderError`, and `runtime.js` for two one-line readers. Lower the gate toward 0 as the measured difference falls'
---

`seniority/dotenv` starts slower than dotenv 18.0.8. The paired median was +1.74 ms in one run and +4.88 ms in another (68 interleaved rounds each, M4 Pro, load average 30 to 40, 2026-10-26). `seniority/lilconfig` starts at or under lilconfig in the same runs (−0.19 ms).

The cause is the module graph, not the code. dotenv is one CommonJS file. `seniority/dotenv` loads six ES modules before it prints: `dotenv.js`, `dotenv-options.js`, `dotenv-scan.js`, `load.js`, `precedence.js` and `runtime.js`. Every ES module costs a resolve, a package-scope lookup, a compile and a link, whatever its size (`benchmarks/cold-start-modules.test.ts` measured that cost for burgee). The bundled bytes say the opposite: 5,966 B against dotenv's 11,570 (0.516). A bundler folds the six files into one, and Node's loader does not.

No published claim rests on this row. R9's time bar names lilconfig only, and the README publishes no start-up figure for the `.env` drop-in.
