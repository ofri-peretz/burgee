/**
 * Z1 / U7 — the shape lock. A working program is ONE file: `npm i roundel`, write it,
 * run it. No build step, no config, no directory convention.
 *
 * It installs the real packed tarball rather than importing from source, because
 * importing from source would not prove that a stranger can do this. Mirrors
 * `burgee/src/shape.test.ts`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
 * The whole program. `.mjs` so it runs in any project whatever its package.json says
 * about "type". With `tty` on argv it declares a truecolor terminal instead of the real
 * streams, which is how the styled path is proven from a test that is itself a pipe.
 */
const ONE_FILE = `import { fly } from 'roundel/theme';
import { error, ok } from 'roundel/tokens';

const rt = process.argv[2] === 'tty'
  ? { env: { COLORTERM: 'truecolor' }, isTTY: { stdout: true } }
  : { env: process.env, isTTY: { stdout: Boolean(process.stdout.isTTY) } };
fly({}, rt);
process.stdout.write(\`\${ok('ok')} \${error('error')}\\n\`);
`;

let dir: string;

function run(...argv: string[]): string {
  return execFileSync(process.execPath, ['cli.mjs', ...argv], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'roundel-shape-'));
  const tarball = npm(['pack', '--silent', '--pack-destination', dir], { cwd: pkgRoot, encoding: 'utf8' }).trim();
  npm(['install', '--no-audit', '--no-fund', '--silent', join(dir, tarball)], { cwd: dir, stdio: 'ignore' });
  writeFileSync(join(dir, 'cli.mjs'), ONE_FILE);
}, 120_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('Z1 — one file, npm i, no build step', () => {
  it('prints plain text through a pipe, whatever the env says', () => {
    expect(run()).toBe('ok error\n');
  });

  it('prints the brand in truecolor on a terminal that has it', () => {
    expect(run('tty')).toBe('\u001B[38;2;13;148;96mok\u001B[39m \u001B[38;2;244;121;74merror\u001B[39m\n');
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
        "const { outputMode } = require('roundel/policy');",
        "const { error } = require('roundel/tokens');",
        "const { fly } = require('roundel');",
        "if (typeof fly !== 'function') throw new Error('roundel has no fly');",
        "process.stdout.write(outputMode({ env: {}, isTTY: { stdout: false } }) + ' ' + error('e'));",
      ].join('\n'),
    );
    try {
      const out = execFileSync(process.execPath, [cjs], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      expect(out).toBe('pipe e');
    } finally {
      rmSync(cjs, { force: true }); // the one-file assertion above must stay true
    }
  });

  it('the package it installed has zero runtime dependencies (U6)', () => {
    const manifest = JSON.parse(npm(['ls', 'roundel', '--json', '--depth', '1'], { cwd: dir, encoding: 'utf8' })) as {
      dependencies?: Record<string, { dependencies?: Record<string, unknown> }>;
    };
    expect(Object.keys(manifest.dependencies?.roundel?.dependencies ?? {})).toEqual([]);
  });
});
