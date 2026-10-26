// Compares two mutant sets (Stryker report vs oxmutate) by file + start + mutator + replacement.
import { readFileSync } from 'node:fs';
const [a, b] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')));
const norm = (s) => s.replace(/\s+/g, '').replace(/'/g, '"');
const keyOf = (file, m, withRepl = true) => `${file}:${m.location.start.line}:${m.location.start.column}:${m.mutatorName}${withRepl ? ':' + norm(m.replacement) : ''}`;
const bag = (r, withRepl) => {
  const m = new Map();
  for (const [file, f] of Object.entries(r.files)) for (const x of f.mutants) {
    const k = keyOf(file, x, withRepl);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
};
for (const withRepl of [false, true]) {
  const A = bag(a, withRepl), B = bag(b, withRepl);
  let both = 0; const onlyA = [], onlyB = [];
  for (const [k, n] of A) { const nb = B.get(k) ?? 0; both += Math.min(n, nb); for (let i = nb; i < n; i++) onlyA.push(k); }
  for (const [k, n] of B) { const na = A.get(k) ?? 0; for (let i = na; i < n; i++) onlyB.push(k); }
  const total = [...A.values()].reduce((s, n) => s + n, 0);
  console.log(`${withRepl ? 'location+mutator+replacement' : 'location+mutator'}: matched ${both}/${total} (A) vs ${[...B.values()].reduce((s, n) => s + n, 0)} (B); only in A: ${onlyA.length}, only in B: ${onlyB.length}`);
  if (withRepl === false) {
    const byMut = (list) => list.reduce((o, k) => ((o[k.split(':')[3]] = (o[k.split(':')[3]] ?? 0) + 1), o), {});
    console.log('  only A by mutator', JSON.stringify(byMut(onlyA)), '\n  only B by mutator', JSON.stringify(byMut(onlyB)));
    console.log('  sample only A:', onlyA.slice(0, 8).join('  '), '\n  sample only B:', onlyB.slice(0, 8).join('  '));
  }
}
