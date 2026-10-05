#!/usr/bin/env node
// Re-converges the foundation tier's recorded weights after any change to what a foundation
// package ships — the fix for "the package and its recorded weight disagree — re-measure and
// update the band" in a package's own `src/weight.test.ts`.
//
// It takes rounds because each package's README prints these weights and the README is in
// the tarball: rewriting the band changes the README, which changes the size. Usually one.
// The band is the only file it writes besides the READMEs and their docs-app projections
// (`scripts/sync-package-docs.ts`): linegauge's `ceilings.json` used to
// mirror `layers.linegauge` under `y8.measured`, and its test now reads the band instead.
//
// It clears every package's `dist/` and rebuilds before measuring, because the measurement
// is `npm pack --dry-run` and `tsc` never deletes an output whose source is gone: on its
// third use a `dist/` left by another branch's build added 5.7 KB of files to closeout that
// no source on this branch produces. Promoted from a throwaway on that use (2026-09-23).
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BAND = join(root, '.sdlc/bands/foundation-ceilings.json');
const PLACES = 4;
const ROUNDS = 6;

const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const write = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const ratio = (ours, ceiling) => Number((ours / ceiling).toFixed(PLACES));

function packed(pkg) {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: join(root, 'packages', pkg), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out)[0].unpackedSize;
}

for (const pkg of readdirSync(join(root, 'packages'))) rmSync(join(root, 'packages', pkg, 'dist'), { recursive: true, force: true });
process.stdout.write('cleared every dist/, building\n');
execFileSync('npx', ['turbo', 'run', 'build', '--force'], { cwd: root, stdio: 'ignore' });

for (let round = 1; round <= ROUNDS; round += 1) {
  const band = read(BAND);
  let moved = 0;
  for (const [pkg, layer] of Object.entries(band.layers)) {
    const ours = packed(pkg);
    if (ours === layer.ours) continue;
    moved += 1;
    process.stdout.write(`  ${pkg}: ${layer.ours} -> ${ours}\n`);
    layer.ours = ours;
    layer.ratio = ratio(ours, layer.ceiling);
  }
  if (moved === 0) {
    // The docs apps carry a projection of each README; leaving it stale fails `sync-package-docs.test.ts`.
    if (round > 1) execFileSync('npx', ['tsx', 'scripts/sync-package-docs.ts'], { cwd: root, stdio: 'ignore' });
    process.stdout.write(`✓ stable after ${round - 1} round(s)\n`);
    process.exit(0);
  }
  write(BAND, band);
  process.stdout.write(`round ${round}: ${moved} moved, regenerating READMEs\n`);
  execFileSync('npx', ['tsx', 'scripts/readme-benchmarks.ts'], { cwd: root, stdio: 'ignore' });
}
process.stderr.write(`✖ still moving after ${ROUNDS} rounds — a README that prints its own size can oscillate; look at the last two\n`);
process.exit(1);
