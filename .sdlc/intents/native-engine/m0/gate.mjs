// G1, load-coherent: per round and per subject, back to back, (a) the JS `migrate --dry-run` wall,
// (b) the JS per-file work in a fresh process (phases.mjs, 1 run: cold JIT, as the command has it),
// (c) the Rust binary's whole per-file pipeline, process start included (8 threads). Ratios are taken
// within a round, so every term saw the same machine; the medians are over rounds.
//   node gate.mjs <packages/burgee/dist> <spike binary> <mapping.tsv> <rounds> <subject-dir>...
import { spawnSync } from 'node:child_process';
import { loadavg } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const [dist, bin, mapping, roundsArg, ...dirs] = process.argv.slice(2);
const phases = fileURLToPath(new URL('./phases.mjs', import.meta.url));
const time = (cmd, args) => { const s = process.hrtime.bigint(); const p = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 26 }); const ms = Number(process.hrtime.bigint() - s) / 1e6; if (p.status !== 0 && p.status !== 1) throw new Error(`${cmd} ${args.join(' ')}: exit ${p.status}\n${p.stderr}`); return { ms, out: p.stdout }; };
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const rows = Object.fromEntries(dirs.map((d) => [basename(d), { whole: [], perFile: [], rust: [], ceiling: [], projected: [] }]));
const loads = [];
for (let r = 0; r < Number(roundsArg); r++) {
  loads.push(loadavg()[0]);
  for (const d of dirs) {
    const row = rows[basename(d)];
    const whole = time('node', [join(dist, 'cli.js'), 'migrate', '--dry-run', '--json', '--only', 'commander,yargs', d]).ms;
    const perFile = JSON.parse(time('node', [phases, dist, d, '1']).out).perFileTotal.median;
    const rust = time(bin, ['bench', mapping, d, '--threads', '8', '--runs', '1']).ms;
    row.whole.push(whole); row.perFile.push(perFile); row.rust.push(rust);
    row.ceiling.push(whole / Math.max(whole - perFile, 1));
    row.projected.push(whole / Math.max(whole - perFile + rust, 1));
  }
}
const out = { rounds: Number(roundsArg), loadFirst: +Math.min(...loads).toFixed(1), loadMedian: +med(loads).toFixed(1), loadMax: +Math.max(...loads).toFixed(1) };
for (const [k, v] of Object.entries(rows)) out[k] = Object.fromEntries(Object.entries(v).map(([m, xs]) => [m, { median: +med(xs).toFixed(m === 'ceiling' || m === 'projected' ? 2 : 1), min: +Math.min(...xs).toFixed(2), max: +Math.max(...xs).toFixed(2) }]));
console.log(JSON.stringify(out));
