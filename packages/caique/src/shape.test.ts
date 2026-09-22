/**
 * Z1 / U7 — the shape lock. A working program is ONE file: `npm i caique`, write it, run it.
 * No build step, no config, no directory convention.
 *
 * It installs the real packed tarballs — caique's and the two same-repo packages it depends
 * on — rather than importing from source, because importing from source would not prove that
 * a stranger can do this. Mirrors `flagstaff/src/shape.test.ts`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** npm on Windows is `npm.cmd`, which Node will only spawn through a shell. */
const WINDOWS = process.platform === 'win32';
function npm(args: string[], options: Parameters<typeof execFileSync>[2]): string {
  return String(execFileSync(WINDOWS ? 'npm.cmd' : 'npm', args, { ...options, shell: WINDOWS }));
}

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const closeoutRoot = resolve(pkgRoot, '../closeout');
const linegaugeRoot = resolve(pkgRoot, '../linegauge');

/**
 * The whole program: the decision a CLI makes before it prompts. With no terminal a missing
 * required value is a usage error that names the flag; with one, it is a prompt. `tty` on
 * argv declares the terminal, which is how both paths are proven from a test that is a pipe.
 */
const ONE_FILE = `import { decide } from 'caique/decide';

const tty = process.argv[2] === 'tty';
const verdict = decide({
  value: undefined,
  spec: { kind: 'text', message: 'Where should it go?' },
  option: 'output-dir',
  runtime: { env: {}, isTTY: { stdin: tty } },
  required: true,
});
process.stdout.write(\`\${verdict.action} \${verdict.code ?? '-'} \${verdict.message ?? ''}\\n\`);
`;

let dir: string;

function node(file: string, ...argv: string[]): string {
  return execFileSync(process.execPath, [file, ...argv], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'caique-shape-'));
  const tarballs = [closeoutRoot, linegaugeRoot, pkgRoot].map((root) => join(dir, npm(['pack', '--silent', '--pack-destination', dir], { cwd: root, encoding: 'utf8' }).trim()));
  npm(['install', '--no-audit', '--no-fund', '--silent', ...tarballs], { cwd: dir, stdio: 'ignore' });
  writeFileSync(join(dir, 'cli.mjs'), ONE_FILE);
}, 120_000);

/** Every assertion spawns; see `roundel/src/shape.test.ts` for why a spawn needs 30 s under turbo. */
const SPAWN = 30_000;

afterAll(() => rmSync(dir, { recursive: true, force: true }), SPAWN);

describe('Z1 — one file, npm i, no build step', { timeout: SPAWN }, () => {
  it('with no terminal, a missing required value is a usage error that names the flag', () => {
    expect(node('cli.mjs')).toBe('error USAGE --output-dir is required when there is no terminal\n');
  });

  it('on a terminal, the same call is a prompt', () => {
    expect(node('cli.mjs', 'tty')).toBe('prompt - \n');
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
        "const { ask, decide, processRuntime } = require('caique');",
        "const clack = require('caique/clack');",
        "const inquirer = require('caique/inquirer');",
        "process.stdout.write([ask, decide, processRuntime, clack.limitOptions, inquirer.createPrompt].map((f) => typeof f).join(' '));",
      ].join('\n'),
    );
    try {
      expect(node(cjs)).toBe('function function function function function');
    } finally {
      rmSync(cjs, { force: true }); // the one-file assertion above must stay true
    }
  });

  it('the package it installed depends on closeout and linegauge and on nothing else (U6: 0 external, 2 same-repo)', () => {
    const installed = JSON.parse(readFileSync(join(dir, 'node_modules/caique/package.json'), 'utf8')) as { dependencies?: Record<string, string> };
    expect(Object.keys(installed.dependencies ?? {}).toSorted()).toEqual(['closeout', 'linegauge']);
    expect(existsSync(join(dir, 'node_modules/closeout/package.json'))).toBe(true);
    expect(existsSync(join(dir, 'node_modules/linegauge/package.json'))).toBe(true);
    expect(existsSync(join(dir, 'node_modules/caique/node_modules'))).toBe(false);
  });
});
