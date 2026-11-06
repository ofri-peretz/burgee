// Profile one oxmutate run on a package subset, the way scripts/mutation.ts runs it on CI.
// usage: node prof.mjs <oxmutate-dist-dir> <package-dir> <out.json> <mutate-spec>[,<mutate-spec>...] [concurrency]
// Writes {stats, phases, verdicts: {id: status}, wallMs} to <out.json>.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [dist, pkgDir, out, specs, conc = '4'] = process.argv.slice(2);
const SETUP = path.resolve(pkgDir, '../../scripts/mutation-vitest-setup.ts');
const SKIPPED = { caique: ['src/shape.test.ts'], 'compat-oracle': [], oxmutate: ['src/e2e.test.ts', 'src/vitest5-regression.test.ts', 'src/schemas.test.ts', 'src/sensitivity.test.ts'] };
const pkg = path.basename(pkgDir);
const wrapperDir = path.join(pkgDir, '.mutation');
mkdirSync(wrapperDir, { recursive: true });
const vitestConfig = path.join(wrapperDir, 'vitest.config.ts');
writeFileSync(vitestConfig, [
  "import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';",
  "import base from '../vitest.config.ts';",
  'export default mergeConfig(base, defineConfig({',
  `  root: ${JSON.stringify(pkgDir)},`,
  `  test: { setupFiles: [${JSON.stringify(SETUP)}], exclude: [...configDefaults.exclude, ...${JSON.stringify(SKIPPED[pkg] ?? [])}] },`,
  '}));', ''].join('\n'));
const { loadOptions, run } = await import(path.join(dist, 'index.js'));
const options = await loadOptions(pkgDir, {
  mutate: specs.split(','), vitestConfig, concurrency: Number(conc), timeoutMS: 10_000, dryRunTimeoutMinutes: 15, reporters: [], allowEmpty: true, ...(process.env.STRYKER_COMPAT ? { strykerCompat: true } : {}), ...(process.env.DRY ? { dryRunOnly: true } : {}),
});
const t0 = performance.now();
try {
  const res = await run(options);
  const s = res.stats;
  const phases = { instrument: s.instrumentMs, dry: s.dryRunMs, warm: s.mutationMs, static: s.staticMs, isolated: s.isolatedMs, unaccounted: s.wallMs - s.instrumentMs - s.dryRunMs - s.mutationMs - (s.staticMs ?? 0) - s.isolatedMs };
  const verdicts = Object.fromEntries(res.mutants.map((m) => [`${m.file}:${m.start.line}:${m.start.column}:${m.mutatorName}:${m.replacement}`, m.status]));
  const reasons = Object.fromEntries(res.mutants.filter((m) => m.statusReason).map((m) => [`${m.file}:${m.start.line}:${m.start.column}:${m.mutatorName}:${m.replacement}`, m.statusReason]));
  const counts = {};
  for (const m of res.mutants) counts[m.status] = (counts[m.status] ?? 0) + 1;
  const statics = res.mutants.filter((m) => m.static).length;
  writeFileSync(out, JSON.stringify({ pkg, specs, wallMs: performance.now() - t0, stats: s, phases, counts, statics, verdicts, reasons }, null, 1));
  console.log(JSON.stringify({ pkg, wallS: ((performance.now() - t0) / 1000).toFixed(1), counts, statics, phases: Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, Math.round(v ?? 0)])), stats: s }));
} finally {
  rmSync(wrapperDir, { recursive: true, force: true });
}
