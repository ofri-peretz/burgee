// Self time by bucket for a cold CLI run: module loading/compiling vs burgee code vs node bootstrap.
import { readFileSync } from 'node:fs';
const p = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map(); for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const self = new Map(); p.samples.forEach((s, i) => self.set(s, (self.get(s) ?? 0) + (p.timeDeltas[i] ?? 0) / 1000));
const LOADER = /compileSourceTextModule|ModuleWrap|moduleResolve|defaultResolve|finalizeResolution|getSource|readFileSync|loadESM|load$|link|instantiate|evaluate|translators|compileFunction|wrapSafe|resolve/;
const b = {};
for (const [id, ms] of self) {
  const f = byId.get(id).callFrame; const url = f.url || '';
  // Walk up: is this sample under a module loader frame?
  let under = false; let cur = id; let hops = 0;
  while (cur !== undefined && hops++ < 200) { const cf = byId.get(cur).callFrame; if ((cf.url || '').startsWith('node:internal/modules') ) { under = true; break; } cur = parent.get(cur); }
  let k;
  if (['(idle)', '(program)', '(garbage collector)', '(root)'].includes(f.functionName)) k = f.functionName;
  else if (url.includes('/burgee/dist/') || url.includes('/packages/')) k = under ? 'burgee code, during module evaluation' : 'burgee code: parse, dispatch, render';
  else if (url.startsWith('node:internal/modules') || under) k = 'module loading (resolve, read, compile)';
  else k = 'node bootstrap / other';
  b[k] = (b[k] ?? 0) + ms;
}
const total = Object.values(b).reduce((x, y) => x + y, 0);
for (const [k, v] of Object.entries(b).sort((x, y) => y[1] - x[1])) console.log(v.toFixed(1).padStart(7), (100 * v / total).toFixed(0).padStart(3) + '%', k);
