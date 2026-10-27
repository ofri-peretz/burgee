// The byte comparison: every file the JavaScript build rewrites without a refusal or a kept import,
// against the file the Rust spike emitted for it; and every file the spike rewrote that JS did not.
//   node compare.mjs <packages/burgee/dist> <project-dir> <rust-emit-dir>
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const [dist, dir, emit] = process.argv.slice(2);
const m = await import(join(dist, 'migrate.js'));
const files = m.sourceFiles(dir);
const r = { files: files.length, jsRewritten: 0, compared: 0, identical: 0, differ: [], jsRefusedOrKept: 0, rustOnly: [], jsOnly: [] };
for (const f of files) {
  const text = readFileSync(join(dir, f), 'utf8');
  const js = m.rewriteSource(text);
  const rustPath = join(emit, f);
  const rust = existsSync(rustPath) ? readFileSync(rustPath, 'utf8') : undefined;
  if (js.refused.length > 0 || js.kept.length > 0) { r.jsRefusedOrKept++; continue; }
  if (js.mapped.length === 0) { if (rust !== undefined) r.rustOnly.push(f); continue; }
  r.jsRewritten++;
  if (rust === undefined) { r.jsOnly.push(f); continue; }
  r.compared++;
  if (rust === js.source) r.identical++; else r.differ.push(f);
}
console.log(JSON.stringify(r));
