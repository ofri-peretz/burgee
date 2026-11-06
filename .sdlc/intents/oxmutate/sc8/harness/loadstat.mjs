// Summarise a run's load log: node loadstat.mjs <file.loadlog>...
import { readFileSync } from 'node:fs';
for (const f of process.argv.slice(2)) {
  const v = readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => Number(l.replace(/[{}]/g, '').split(/\s+/)[1]));
  const sorted = [...v].sort((a, b) => a - b);
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  console.log(f.split('/').pop(), JSON.stringify({ samples: v.length, mean: +mean.toFixed(1), median: sorted[Math.floor(v.length / 2)], max: sorted.at(-1), min: sorted[0] }));
}
