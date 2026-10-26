// Verdict agreement between a Stryker report and an oxmutate run whose mutant ids differ.
//   node compare-verdicts.mjs <stryker report.json> <oxmutate mutants.json> <warm-runner results.json>
// Mutants are matched by file + start + mutator + normalized replacement (then without the
// replacement, for cosmetic differences such as redundant parentheses).
import { readFileSync } from 'node:fs';

const [strykerFile, mutantsFile, resultsFile] = process.argv.slice(2);
const stryker = JSON.parse(readFileSync(strykerFile, 'utf8'));
const ours = JSON.parse(readFileSync(mutantsFile, 'utf8'));
const results = JSON.parse(readFileSync(resultsFile, 'utf8')).results;

const norm = (s) => s.replace(/\s+/g, '').replace(/'/g, '"').replace(/[()]/g, '');
const loose = (f, m) => `${f}:${m.location.start.line}:${m.location.start.column}:${m.mutatorName}`;
const strict = (f, m) => `${loose(f, m)}:${norm(m.replacement)}`;
const comparable = (s) => (s === 'Timeout' ? 'Killed' : s);

const index = new Map();
for (const [f, x] of Object.entries(stryker.files))
  for (const m of x.mutants) {
    for (const k of [strict(f, m), loose(f, m)]) {
      if (!index.has(k)) index.set(k, []);
      index.get(k).push(m);
    }
  }

const used = new Set();
let matched = 0, agree = 0, unmatched = 0;
const disagreements = [];
const counts = {};
for (const [f, x] of Object.entries(ours.files))
  for (const m of x.mutants) {
    const verdict = results[m.id]?.status ?? 'Missing';
    counts[verdict] = (counts[verdict] ?? 0) + 1;
    const candidates = [...(index.get(strict(f, m)) ?? []), ...(index.get(loose(f, m)) ?? [])].filter((s) => !used.has(s));
    const twin = candidates[0];
    if (!twin) {
      unmatched++;
      continue;
    }
    used.add(twin);
    matched++;
    if (comparable(verdict) === comparable(twin.status)) agree++;
    else disagreements.push({ at: loose(f, m), replacement: m.replacement, stryker: twin.status, ours: verdict });
  }

console.log(JSON.stringify({ oursTotal: matched + unmatched, matched, unmatched, agree, agreementPct: (100 * agree) / matched, verdicts: counts }, null, 1));
for (const d of disagreements) console.log(`  ${d.at} ${JSON.stringify(d.replacement).slice(0, 60)} stryker=${d.stryker} ours=${d.ours}`);
