/**
 * Z1 / U7 — the shape lock. A working program is ONE file: `npm i controlroom`, write it,
 * run it. No build step, no config, no directory convention.
 *
 * The package is reserved, so the program is one line, but the shape is the same one every
 * sibling locks: the real packed tarball, installed, imported from ESM and required from
 * CommonJS, with nothing installed beside it. Mirrors `roundel/src/shape.test.ts`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** npm on Windows is `npm.cmd`, which Node will only spawn through a shell. */
const WINDOWS = process.platform === 'win32';
function npm(args: string[], options: Parameters<typeof execFileSync>[2]): string {
  return String(execFileSync(WINDOWS ? 'npm.cmd' : 'npm', args, { ...options, shell: WINDOWS }));
}

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));

/** The whole program. `.mjs` so it runs in any project whatever its package.json says about "type". */
const ONE_FILE = `import { status } from 'controlroom';

process.stdout.write(\`\${status}\\n\`);
`;

let dir: string;

function node(file: string): string {
  return execFileSync(process.execPath, [file], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'controlroom-shape-'));
  const tarball = npm(['pack', '--silent', '--pack-destination', dir], { cwd: pkgRoot, encoding: 'utf8' }).trim();
  npm(['install', '--no-audit', '--no-fund', '--silent', join(dir, tarball)], { cwd: dir, stdio: 'ignore' });
  writeFileSync(join(dir, 'cli.mjs'), ONE_FILE);
}, 120_000);

/** Every assertion shells out; see `roundel/src/shape.test.ts` for why 30 s is the clock. */
const SPAWN = 30_000;

// Teardown gets setup's clock, not a spawn's: under the pre-push battery one `rmSync` of a
// small install ran past 30 s in more than one package.
afterAll(() => rmSync(dir, { recursive: true, force: true }), 120_000);

describe('Z1 — one file, npm i, no build step', { timeout: SPAWN }, () => {
  it('runs, and says it is reserved', () => {
    expect(node('cli.mjs')).toBe('reserved\n');
  });

  it('the user authored exactly one file, and never ran a build', () => {
    const authored = readdirSync(dir).filter(
      (f) => !['node_modules', 'package.json', 'package-lock.json'].includes(f) && !f.endsWith('.tgz'),
    );
    expect(authored).toEqual(['cli.mjs']);
  });

  it('is consumable from CommonJS too — the same ESM file, through require(esm) (K2)', () => {
    const cjs = join(dir, 'probe.cjs');
    writeFileSync(cjs, "process.stdout.write(require('controlroom').status);");
    try {
      expect(node(cjs)).toBe('reserved');
    } finally {
      rmSync(cjs, { force: true }); // the one-file assertion above must stay true
    }
  });

  it('the package it installed depends on linegauge and on nothing else (U6: 0 external, 1 same-repo)', () => {
    const installed = JSON.parse(readFileSync(join(dir, 'node_modules/controlroom/package.json'), 'utf8')) as { dependencies?: Record<string, string> };
    expect(Object.keys(installed.dependencies ?? {})).toEqual(['linegauge']);
    expect(existsSync(join(dir, 'node_modules/linegauge/package.json'))).toBe(true);
    expect(existsSync(join(dir, 'node_modules/controlroom/node_modules'))).toBe(false);
  });
});
