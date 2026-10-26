// M1 probe: a Vitest runner that re-invokes each collected test per covering mutant, inside a real
// Vitest worker (hooks, expect, vi and the environment stay Vitest's). Plan and results by file.
import { VitestTestRunner } from 'vitest/runners';
import { getFn } from '@vitest/runner';
import { appendFileSync, readFileSync } from 'node:fs';

const plan = JSON.parse(readFileSync(process.env.OXM_PLAN, 'utf8')); // test full name → mutant ids
const out = process.env.OXM_OUT;
const ns = (globalThis.__stryker__ ??= {});
const killed = new Set(); // per worker file context: bail once a mutant is killed

function fullName(task) {
  const parts = [task.name];
  for (let s = task.suite; s && s.type === 'suite' && s.name; s = s.suite) parts.unshift(s.name);
  return parts.join(' ').trim();
}

export default class OxmRunner extends VitestTestRunner {
  async runTask(test) {
    const fn = getFn(test);
    const name = fullName(test);
    const lines = [];
    for (const id of plan[name] ?? []) {
      if (killed.has(id)) continue;
      const t0 = performance.now();
      ns.activeMutant = id;
      ns.hitCount = 0;
      ns.hitLimit = 1e7;
      let failed = false;
      try {
        await fn();
      } catch {
        failed = true;
      }
      ns.activeMutant = undefined;
      ns.hitCount = undefined;
      ns.hitLimit = undefined;
      if (failed) killed.add(id);
      lines.push(JSON.stringify({ id, test: name, failed, ms: performance.now() - t0 }));
    }
    if (lines.length) appendFileSync(out, lines.join('\n') + '\n');
    await fn(); // the real, unmutated run Vitest reports
  }
}
