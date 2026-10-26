import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const time = (f) => {
  const t = readFileSync(f, 'utf8');
  const m = t.match(/([\d.]+) real\s+([\d.]+) user\s+([\d.]+) sys/);
  const rss = Number(t.match(/(\d+)\s+maximum resident set size/)?.[1] ?? 0);
  return m ? { real: +m[1], cpu: +m[2] + +m[3], rssMb: rss / 1048576 } : undefined;
};
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const rows = {};
const sub = '../subject';
// Every Stryker run present except those listed in EXCLUDE (2026-10-26: run 4 overlapped other work).
const EXCLUDE = new Set((process.env.EXCLUDE ?? '').split(',').filter(Boolean));
rows['stryker'] = readdirSync(sub)
  .filter((f) => /^stryker-run\d+\.time$/.test(f) && !EXCLUDE.has(f.match(/\d+/)[0]))
  .map((f) => time(`${sub}/${f}`));
const groups = {};
for (const f of readdirSync('runs').filter((f) => f.endsWith('.time'))) {
  const g = f.replace(/-r\d+\.time$/, '');
  (groups[g] ??= []).push(f);
}
for (const [g, fs] of Object.entries(groups)) rows[g] = fs.map((f) => time(`runs/${f}`)).filter(Boolean);
const out = {};
for (const [g, xs] of Object.entries(rows)) out[g] = { n: xs.length, realMedian: med(xs.map((x) => x.real)), realMin: Math.min(...xs.map((x) => x.real)), realMax: Math.max(...xs.map((x) => x.real)), cpuMedian: med(xs.map((x) => x.cpu)) };
// agreement per run
for (const [g, fs] of Object.entries(groups)) {
  const agr = [];
  for (const f of fs) {
    const base = `runs/${f.replace(/\.time$/, '')}`;
    if (g.startsWith('warm')) agr.push(JSON.parse(readFileSync(`${base}.json`, 'utf8')).summary.agreement.pct);
    else {
      const o = execFileSync('node', ['compare-verdicts.mjs', `${sub}/reports/stryker-run1.json`, `${base}.mutants.json`, `${base}.results.json`], { encoding: 'utf8' });
      agr.push(JSON.parse(o.slice(0, o.indexOf('\n}') + 2)).agreementPct);
    }
  }
  out[g].agreementPct = agr.map((x) => +x.toFixed(2));
}
console.log(JSON.stringify(out, null, 1));
