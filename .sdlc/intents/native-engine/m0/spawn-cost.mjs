// What a JavaScript caller pays to hand work to the native binary: one spawnSync of it on a tiny file.
//   node spawn-cost.mjs <binary> <mapping.tsv> <file> [runs]
import { spawnSync } from 'node:child_process';
const [bin, mapping, file, runs = '31'] = process.argv.slice(2);
const xs = [];
for (let i = 0; i < Number(runs); i++) { const s = process.hrtime.bigint(); spawnSync(bin, ['rewrite', mapping, file], { stdio: 'ignore' }); xs.push(Number(process.hrtime.bigint() - s) / 1e6); }
xs.sort((a, b) => a - b);
console.log(JSON.stringify({ spawn: { median: +xs[Math.floor(xs.length / 2)].toFixed(2), min: +xs[0].toFixed(2), max: +xs.at(-1).toFixed(2) } }));
