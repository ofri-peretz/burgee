// Plan from a Stryker report: test full name → covering mutant ids, runaway mutants excluded.
import { readFileSync, writeFileSync } from 'node:fs';
const r = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const names = new Map(Object.values(r.testFiles).flatMap((f) => f.tests.map((t) => [t.id, t.name])));
const plan = {};
let planned = 0;
for (const f of Object.values(r.files))
  for (const m of f.mutants) {
    if (['Timeout', 'RuntimeError', 'NoCoverage'].includes(m.status) || !m.coveredBy?.length) continue;
    planned++;
    for (const t of m.coveredBy) (plan[names.get(t)] ??= []).push(m.id);
  }
writeFileSync(process.argv[3], JSON.stringify(plan));
console.log(JSON.stringify({ planned, tests: Object.keys(plan).length }));
