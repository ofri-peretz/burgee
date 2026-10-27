// The tables spec.md quotes, from results/.   node summarize.mjs <results-dir>
// CPU columns: phases.jsonl (in process, 11 runs). Whole-command columns: gate.json (gate.mjs, every
// term of a ratio measured back to back in the same round).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2];
const read = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const lines = (f) => readFileSync(join(dir, f), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const gate = read('gate.json');
const spawn = read('spawn.json').spawn.median;
const bin = read('binary.json').binaryBytes;
const FIELD = ['wait-port', 'madge', 'tsc-alias', 'node-qrcode', 'svgo'];
const f1 = (x) => x.toFixed(1);
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const out = [];
out.push(`Binary: ${(bin / 1024).toFixed(0)} KiB stripped. Spawn of the binary from Node, tiny file: ${spawn} ms median.`);
out.push('');
out.push('CPU, in process, single thread (phases.jsonl):');
out.push('');
out.push('| Subject | Files | MB | JS filter + scan | Rust filter + parse + rewrite | Ratio |');
out.push('| :-- | --: | --: | --: | --: | --: |');
for (const r of lines('phases.jsonl')) {
  const jc = r.js.prefilter.median + r.js.scanRewrite.median; const rc = r.rust1.prefilter + r.rust1.parseRewrite;
  out.push(`| ${r.subject} | ${r.js.files} | ${f1(r.js.bytes / 1e6)} | ${f1(jc)} ms | ${f1(rc)} ms | ${f1(jc / Math.max(rc, 0.01))}x |`);
}
out.push('');
out.push(`Whole command (gate.json, ${gate.rounds} rounds, load average ${gate.loadFirst}–${gate.loadMax}, median ${gate.loadMedian}):`);
out.push('');
out.push('| Subject | JS `migrate` wall | JS per-file work | Rust binary, whole pipeline | Ceiling | Projected |');
out.push('| :-- | --: | --: | --: | --: | --: |');
for (const [s, v] of Object.entries(gate)) {
  if (v?.whole === undefined) continue;
  out.push(`| ${s} | ${f1(v.whole.median)} ms | ${f1(v.perFile.median)} ms | ${f1(v.rust.median)} ms | ${v.ceiling.median.toFixed(2)}x | ${v.projected.median.toFixed(2)}x |`);
}
out.push('');
out.push(`Median over the five field-trial projects: ceiling **${med(FIELD.map((s) => gate[s].ceiling.median)).toFixed(2)}x**, projected **${med(FIELD.map((s) => gate[s].projected.median)).toFixed(2)}x** (gate: 2x, D-20261020-native-engine-order).`);
const c = lines('bytes.jsonl').filter((b) => b.compare).reduce((a, b) => ({ n: a.n + 1, compared: a.compared + b.compare.compared, identical: a.identical + b.compare.identical, one: a.one + b.compare.rustOnly.length + b.compare.jsOnly.length, refused: a.refused + b.compare.jsRefusedOrKept }), { n: 0, compared: 0, identical: 0, one: 0, refused: 0 });
out.push(`Bytes: fixture byte-identical; ${c.identical} of ${c.compared} rewritten files byte-identical across ${c.n} subjects; ${c.one} rewritten by one engine only; ${c.refused} refused or kept by JS (not compared).`);
console.log(out.join('\n'));
