// Phase profile of `burgee migrate`'s per-file work, against the built dist.
// node phases.mjs <burgee-dist-dir> <project-dir> [runs]
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
const [dist, dir, runsArg] = process.argv.slice(2);
const m = await import(join(dist, 'migrate.js'));
const runs = Number(runsArg ?? 7);
const BATCH = 256;
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const rows = [];
for (let r = 0; r < runs; r++) {
  const t0 = performance.now();
  const files = m.sourceFiles(dir);
  const t1 = performance.now();
  const bufs = [];
  for (let i = 0; i < files.length; i += BATCH) bufs.push(...(await Promise.all(files.slice(i, i + BATCH).map((f) => readFile(join(dir, f))))));
  const t2 = performance.now();
  const admitted = bufs.filter((b) => m.mentionsAHost(b));
  const t3 = performance.now();
  const texts = admitted.map((b) => b.toString('utf8'));
  const t4 = performance.now();
  let rewritten = 0;
  for (const t of texts) if (m.rewriteSource(t).mapped.length > 0) rewritten++;
  const t5 = performance.now();
  // the full lexer over EVERY file, as if no pre-filter existed: what a parser-based codemod would pay per file
  let tokens = 0;
  const all = bufs.map((b) => b.toString('utf8'));
  const t6 = performance.now();
  for (const t of all) m.scan(t);
  const t7 = performance.now();
  const bytes = bufs.reduce((n, b) => n + b.length, 0);
  rows.push({ files: files.length, bytes, admitted: admitted.length, rewritten, walk: t1 - t0, read: t2 - t1, prefilter: t3 - t2, decode: t4 - t3, scanRewrite: t5 - t4, perFileTotal: t5 - t0, scanAllFiles: t7 - t6 });
}
const out = { dir, runs, files: rows[0].files, bytes: rows[0].bytes, admitted: rows[0].admitted, rewritten: rows[0].rewritten };
for (const k of ['walk', 'read', 'prefilter', 'decode', 'scanRewrite', 'perFileTotal', 'scanAllFiles']) out[k] = { median: +med(rows.map((x) => x[k])).toFixed(2), min: +Math.min(...rows.map((x) => x[k])).toFixed(2), max: +Math.max(...rows.map((x) => x[k])).toFixed(2) };
console.log(JSON.stringify(out));
