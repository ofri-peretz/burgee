// Survivors oxmutate reports that Stryker detected, and the reverse.
// usage: node survdiff.mjs <stryker result.json> <oxmutate prof.json>
import { readFileSync } from 'node:fs';
const [sf, of] = process.argv.slice(2);
const s = JSON.parse(readFileSync(sf, 'utf8'));
const o = JSON.parse(readFileSync(of, 'utf8'));
const norm = (r) => r.replace(/\s+/g, ' ').trim();
const sKey = (u) => `${u.file.replace(/^packages\/caique\//, '').replace(/^packages\/compat-oracle\//, '')}:${u.line}:${u.column}:${u.mutator}:${norm(u.replacement)}`;
const sSurv = new Set(s.summary.undetected.filter((u) => u.status === 'Survived').map(sKey));
const oSurv = new Set(Object.entries(o.verdicts).filter(([, v]) => v === 'Survived').map(([k]) => { const [f, l, c, m, ...r] = k.split(':'); return `${f}:${l}:${c}:${m}:${norm(r.join(':'))}`; }));
const oAll = new Map(Object.entries(o.verdicts).map(([k, v]) => { const [f, l, c, m, ...r] = k.split(':'); return [`${f}:${l}:${c}:${m}:${norm(r.join(':'))}`, v]; }));
const onlyOx = [...oSurv].filter((k) => !sSurv.has(k));
const onlySt = [...sSurv].filter((k) => !oSurv.has(k));
const byMut = (ks) => Object.entries(ks.reduce((a, k) => ((a[k.split(':')[3]] = (a[k.split(':')[3]] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);
console.log(JSON.stringify({ strykerSurvived: sSurv.size, oxSurvived: oSurv.size, both: [...oSurv].filter((k) => sSurv.has(k)).length, onlyOx: onlyOx.length, onlyStryker: onlySt.length, onlyStrykerOxVerdicts: Object.entries(onlySt.reduce((a, k) => ((a[oAll.get(k) ?? 'absent'] = (a[oAll.get(k) ?? 'absent'] ?? 0) + 1), a), {})), onlyOxByMutator: byMut(onlyOx) }));
console.log('ONLY-OX'); for (const k of onlyOx) console.log(k);
