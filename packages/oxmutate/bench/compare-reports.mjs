// Verdict agreement between two mutation-testing-report-schema files (Stryker's or oxmutate's).
//   node compare-reports.mjs <a.json> <b.json> [--list]
// Mutants match on file + start + end + mutator + replacement (whitespace and redundant
// parentheses ignored), then without the replacement. A timeout counts as a detection, as in
// both tools' scores.
import { readFileSync } from 'node:fs';

const [fa, fb] = process.argv.slice(2);
const list = process.argv.includes('--list');
const load = (f) => {
  const r = JSON.parse(readFileSync(f, 'utf8'));
  return Object.entries(r.files).flatMap(([file, x]) => x.mutants.map((m) => ({ ...m, file: file.replace(/^.*?(src\/)/, '$1') })));
};
const norm = (s) => s.replace(/\s+/g, '').replace(/'/g, '"').replace(/[()]/g, '');
const loose = (m) => `${m.file}:${m.location.start.line}:${m.location.start.column}:${m.location.end.line}:${m.location.end.column}:${m.mutatorName}`;
const strict = (m) => `${loose(m)}:${norm(m.replacement)}`;
const verdict = (s) => (s === 'Timeout' ? 'Killed' : s);
const A = load(fa);
const B = load(fb);
const index = new Map();
for (const m of B) for (const k of [strict(m), loose(m)]) (index.get(k) ?? index.set(k, []).get(k)).push(m);
const used = new Set();
let matched = 0, agree = 0;
const disagreements = [];
for (const m of A) {
  const twin = [...(index.get(strict(m)) ?? []), ...(index.get(loose(m)) ?? [])].find((x) => !used.has(x));
  if (!twin) continue;
  used.add(twin);
  matched++;
  if (verdict(m.status) === verdict(twin.status)) agree++;
  else disagreements.push(`${loose(m)} a=${m.status} b=${twin.status}`);
}
const out = { a: A.length, b: B.length, matched, agree, agreementPct: Number(((100 * agree) / matched).toFixed(2)), onlyA: A.length - matched, onlyB: B.length - matched };
console.log(JSON.stringify(out));
if (list) for (const d of disagreements) console.log('  ' + d);
