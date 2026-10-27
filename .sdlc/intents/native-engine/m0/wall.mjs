// Interleaved wall-time medians for a set of commands. node wall.mjs <runs> <json: {name: [cmd, ...args]}>
import { spawnSync } from 'node:child_process';
import { cpus, loadavg } from 'node:os';
const runs = Number(process.argv[2]);
const cmds = JSON.parse(process.argv[3]);
const t = Object.fromEntries(Object.keys(cmds).map((k) => [k, []]));
for (let r = 0; r < runs; r++) for (const [k, [c, ...a]] of Object.entries(cmds)) {
  const s = process.hrtime.bigint(); const p = spawnSync(c, a, { stdio: ['ignore', 'ignore', 'pipe'] }); const e = Number(process.hrtime.bigint() - s) / 1e6;
  if (p.status !== 0 && p.status !== 1) { console.error(k, 'exit', p.status, p.stderr?.toString().slice(0, 300)); process.exit(1); }
  t[k].push(e);
}
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const out = { runs, load: loadavg().map((x) => +x.toFixed(1)), cores: cpus().length };
for (const [k, xs] of Object.entries(t)) out[k] = { median: +med(xs).toFixed(1), min: +Math.min(...xs).toFixed(1), max: +Math.max(...xs).toFixed(1) };
console.log(JSON.stringify(out));
