/**
 * The M3.5 gate on a real component: closeout's `cursor.ts` mutated, scored by closeout's own
 * tests, and by a spec oracle — `.sdlc/models/save-restore.qnt` simulated by Quint, its traces
 * replayed against `rawMode` (bench/spec/cursor-replay.test.ts). Prints the score and the spec's
 * F metrics, and writes them to `<out>/spec-closeout.json`.
 *
 *   npx tsx packages/oxmutate/bench/spec-closeout.mts [--out <dir>] [--traces 200]
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const closeout = path.join(repo, 'packages/closeout');
const arg = (n: string, d: string): string => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : (process.argv[i + 1] ?? d);
};
const out = path.resolve(arg('out', path.join(here, 'results')));
const wrapper = path.join(closeout, '.mutation');
mkdirSync(wrapper, { recursive: true });
mkdirSync(out, { recursive: true });
try {
  copyFileSync(path.join(here, 'spec/cursor-replay.test.ts'), path.join(wrapper, 'cursor-replay.test.ts'));
  writeFileSync(
    path.join(wrapper, 'vitest.config.ts'),
    `import { defineConfig, mergeConfig } from 'vitest/config';\nimport base from '../vitest.config.ts';\nexport default mergeConfig(base, defineConfig({ test: { include: ['src/cursor.test.ts', '.mutation/cursor-replay.test.ts'], coverage: { enabled: false } } }));\n`,
  );
  const config = {
    mutate: ['src/cursor.ts'],
    vitest: { configFile: '.mutation/vitest.config.ts' },
    concurrency: 4,
    reporters: ['json'],
    specOracles: [{ name: 'save-restore', backend: 'quint', model: '../../.sdlc/models/save-restore.qnt', traces: Number(arg('traces', '200')), maxSteps: 20, seed: '7', replay: ['.mutation/cursor-replay.test.ts'], files: ['src/cursor.ts'] }],
  };
  writeFileSync(path.join(wrapper, 'oxmutate.config.json'), JSON.stringify(config));
  const r = spawnSync(process.execPath, [path.join(repo, 'packages/oxmutate/dist/bin.js'), 'run', '--config', '.mutation/oxmutate.config.json', '--report-dir', out], { cwd: closeout, stdio: 'inherit' });
  if (r.status !== 0) process.exitCode = r.status ?? 1;
  const report = JSON.parse(readFileSync(path.join(out, 'mutation.json'), 'utf8')) as { 'x-oxmutate': { score: unknown; specOracles: unknown; stats: unknown } };
  const summary = { date: new Date().toISOString(), score: report['x-oxmutate'].score, spec: report['x-oxmutate'].specOracles, stats: report['x-oxmutate'].stats };
  writeFileSync(path.join(out, 'spec-closeout.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary.spec, null, 2));
} finally {
  rmSync(wrapper, { recursive: true, force: true });
}
