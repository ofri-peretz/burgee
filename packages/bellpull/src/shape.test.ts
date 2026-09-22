/**
 * Z1 / U7 — the shape lock. A working program is ONE file: `npm i bellpull`, write it, run
 * it. No build step, no config, no directory convention.
 *
 * It installs the real packed tarball rather than importing from source, because importing
 * from source would not prove that a stranger can do this. Mirrors `roundel/src/shape.test.ts`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

/**
 * The whole program: resolve `node` on PATH the way cross-spawn would, run it, and print
 * what it said and whether it succeeded — with no try/catch, which is the package's point.
 */
const ONE_FILE = `import { run } from 'bellpull';

const runtime = { platform: process.platform, env: process.env, cwd: process.cwd() };
const ok = await run('node', ['-e', 'process.stdout.write(String(6 * 7))'], { runtime });
const failed = await run('node', ['-e', 'process.exit(3)'], { runtime });
process.stdout.write(\`\${ok.ok} \${ok.stdout} \${failed.ok} \${failed.code}\\n\`);
`;

let dir: string;

function node(file: string): string {
  return execFileSync(process.execPath, [file], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'bellpull-shape-'));
  const tarball = npm(['pack', '--silent', '--pack-destination', dir], { cwd: pkgRoot, encoding: 'utf8' }).trim();
  npm(['install', '--no-audit', '--no-fund', '--silent', join(dir, tarball)], { cwd: dir, stdio: 'ignore' });
  writeFileSync(join(dir, 'cli.mjs'), ONE_FILE);
}, 120_000);

/** Every assertion spawns; see `roundel/src/shape.test.ts` for why a spawn needs 30 s under turbo. */
const SPAWN = 30_000;

// Teardown gets setup's clock, not a spawn's. It is one `rmSync` of a small install, and under
// the pre-push battery — every package's suite at once — it still ran past 30 s: vitest
// reported "Hook timed out in 30000ms", and this was the only hook declaring 30 s.
afterAll(() => rmSync(dir, { recursive: true, force: true }), 120_000);

describe('Z1 — one file, npm i, no build step', { timeout: SPAWN }, () => {
  it('runs a child found on PATH and reports a non-zero exit as data, not an exception', () => {
    expect(node('cli.mjs')).toBe('true 42 false 3\n');
  });

  it('the user authored exactly one file, and never ran a build', () => {
    const authored = readdirSync(dir).filter(
      (f) => !['node_modules', 'package.json', 'package-lock.json'].includes(f) && !f.endsWith('.tgz'),
    );
    expect(authored).toEqual(['cli.mjs']);
  });

  it('is consumable from CommonJS too — the same ESM file, through require(esm) (K2)', () => {
    const cjs = join(dir, 'probe.cjs');
    writeFileSync(
      cjs,
      [
        "const { run, format } = require('bellpull');",
        "const { whichSync } = require('bellpull/which');",
        "const crossSpawn = require('bellpull/cross-spawn');",
        "process.stdout.write([run, format, whichSync, crossSpawn.default, crossSpawn.sync].map((f) => typeof f).join(' '));",
      ].join('\n'),
    );
    try {
      expect(node(cjs)).toBe('function function function function function');
    } finally {
      rmSync(cjs, { force: true }); // the one-file assertion above must stay true
    }
  });

  it('the package it installed has zero runtime dependencies (U6)', () => {
    const installed = JSON.parse(readFileSync(join(dir, 'node_modules/bellpull/package.json'), 'utf8')) as { dependencies?: Record<string, string> };
    expect(Object.keys(installed.dependencies ?? {})).toEqual([]);
  });
});
