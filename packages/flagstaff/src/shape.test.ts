/**
 * Z1 / U7 — the shape lock. A working program is ONE file: `npm i flagstaff`, write it,
 * run it. No build step, no config, no directory convention. It installs the real packed
 * tarballs — flagstaff's and roundel's, its one same-repo dependency — rather than importing
 * from source, because importing from source would not prove that a stranger can do this.
 * Mirrors `roundel/src/shape.test.ts`.
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
const roundelRoot = resolve(pkgRoot, '../roundel');
const linegaugeRoot = resolve(pkgRoot, '../linegauge');
const ESC = String.fromCharCode(27);

/**
 * The whole program: a spinner over three states. `.mjs` so it runs in any project whatever
 * its package.json says about "type". With `tty` on argv it declares a terminal and drives
 * a manual clock, which is how the animated path is proven from a test that is itself a pipe.
 */
const ONE_FILE = `import { hoist, manualClock } from 'flagstaff/loop';
import { spinner } from 'flagstaff/spinner';

const tty = process.argv[2] === 'tty';
const clock = tty ? manualClock() : { now: () => 0, schedule: () => () => undefined };
const rt = { env: {}, isTTY: { stdout: tty }, stdout: process.stdout, stderr: process.stderr, clock };
const flag = hoist(spinner(), rt, { text: 'building' });
if (tty) clock.tick(160);
flag.update({ text: 'linking' });
flag.lower({ text: 'built', status: 'ok' });
`;

let dir: string;

function run(...argv: string[]): string {
  return execFileSync(process.execPath, ['cli.mjs', ...argv], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'flagstaff-shape-'));
  const tarballs = [roundelRoot, linegaugeRoot, pkgRoot].map((root) => join(dir, npm(['pack', '--silent', '--pack-destination', dir], { cwd: root, encoding: 'utf8' }).trim()));
  npm(['install', '--no-audit', '--no-fund', '--silent', ...tarballs], { cwd: dir, stdio: 'ignore' });
  writeFileSync(join(dir, 'cli.mjs'), ONE_FILE);
}, 120_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('Z1 — one file, npm i, no build step', () => {
  it('prints one line per state through a pipe: no carriage return, no escape', () => {
    expect(run()).toBe('… building\n… linking\n✔ built\n');
  });

  it('animates on a terminal and leaves the static line behind', () => {
    const erase = `${ESC}[1G${ESC}[0J`;
    expect(run('tty')).toBe(`${ESC}[?25l⠋ building${erase}⠙ building${erase}⠹ building${erase}⠹ linking${erase}✔ built\n${ESC}[?25h`);
  });

  it('the user authored exactly one file, and never ran a build', () => {
    const authored = readdirSync(dir).filter((f) => !['node_modules', 'package.json', 'package-lock.json'].includes(f) && !f.endsWith('.tgz'));
    expect(authored).toEqual(['cli.mjs']);
  });

  it('is consumable from CommonJS too — the same ESM file, through require(esm) (K2)', () => {
    const cjs = join(dir, 'probe.cjs');
    writeFileSync(cjs, ["const { spinner } = require('flagstaff/spinner');", "const { hoist } = require('flagstaff');", "if (typeof hoist !== 'function') throw new Error('flagstaff has no hoist');", "process.stdout.write(spinner().static({ text: 'x', status: 'fail' }));"].join('\n'));
    try {
      expect(execFileSync(process.execPath, [cjs], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).toBe('✖ x');
    } finally {
      rmSync(cjs, { force: true }); // the one-file assertion above must stay true
    }
  });

  it('the package it installed depends on linegauge and roundel and on nothing else (U6: 0 external, 2 same-repo)', () => {
    const installed = JSON.parse(readFileSync(join(dir, 'node_modules/flagstaff/package.json'), 'utf8')) as { dependencies?: Record<string, string> };
    expect(Object.keys(installed.dependencies ?? {}).toSorted()).toEqual(['linegauge', 'roundel']);
    expect(existsSync(join(dir, 'node_modules/roundel/package.json'))).toBe(true);
    expect(existsSync(join(dir, 'node_modules/linegauge/package.json'))).toBe(true);
    expect(existsSync(join(dir, 'node_modules/flagstaff/node_modules'))).toBe(false);
  });
});
