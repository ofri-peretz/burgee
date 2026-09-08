/**
 * U7 / Z1 for roundel: the packed tarball installs alone into an empty directory and one
 * file uses it — no build step, no config, nothing else installed. Importing from source
 * would not prove that a stranger can do this.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const WINDOWS = process.platform === 'win32';
function npm(args: string[], options: Parameters<typeof execFileSync>[2]): string {
  return String(execFileSync(WINDOWS ? 'npm.cmd' : 'npm', args, { ...options, shell: WINDOWS }));
}

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));

const ONE_FILE = `import { outputMode, colorLevel } from 'roundel/policy';
import { createTokens } from 'roundel/tokens';
const rt = { isTTY: { stdout: false }, env: { CI: '1' } };
const tokens = createTokens(rt);
console.log(JSON.stringify({ mode: outputMode(rt), level: colorLevel(rt), error: tokens.error('plain') }));
`;

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'roundel-shape-'));
  const tarball = npm(['pack', '--silent', '--pack-destination', dir], { cwd: pkgRoot, encoding: 'utf8' }).trim();
  npm(['install', '--no-audit', '--no-fund', '--silent', join(dir, tarball)], { cwd: dir, stdio: 'ignore' });
  writeFileSync(join(dir, 'use.mjs'), ONE_FILE);
}, 120_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('roundel installs alone and works from one file (U7)', () => {
  it('answers the policy and styles nothing off a terminal', () => {
    const out = execFileSync(process.execPath, ['use.mjs'], { cwd: dir, encoding: 'utf8' });
    expect(JSON.parse(out)).toEqual({ mode: 'ci', level: 0, error: 'plain' });
  });

  it('is reachable from CommonJS through require(esm) (K2)', () => {
    writeFileSync(join(dir, 'use.cjs'), "const { outputMode } = require('roundel/policy'); console.log(outputMode({ isTTY: { stdout: false }, env: {} }));\n");
    expect(execFileSync(process.execPath, ['use.cjs'], { cwd: dir, encoding: 'utf8' }).trim()).toBe('pipe');
  });
});
