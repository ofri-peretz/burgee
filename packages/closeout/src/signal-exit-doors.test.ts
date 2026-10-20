/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `closeout/signal-exit` has two doors: `import` reaches the ES file, `require()` the CommonJS
 * one (closeout-at-incumbent-weight R2). The ES door is there for weight — a bundle of the
 * CommonJS file carries interop that cost more than the whole of `signal-exit` — and it must
 * not cost a guarantee: the two doors answer with the same names and the same list, and a
 * program that reaches both still runs each handler once and dies of the signal once.
 *
 * Real children, as in `signal.test.ts`: what is under test is a process dying, and the
 * built `dist/` files, because the `exports` map and the comment stripper have had their say.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { signalsOn } from './signal-list.js';

const scratch = scratchDirs();
const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as { exports: Record<string, Record<string, string>> };
const doors = manifest.exports['./signal-exit'] ?? {};
const esDoor = new URL(`../${doors['import'] ?? ''}`, import.meta.url);
const cjsDoor = new URL(`../${doors['require'] ?? ''}`, import.meta.url);

const CASE_TIMEOUT_MS = 30_000;

/** Run a child module to its death; its stdout lines and how it died. */
function runChild(source: string): { lines: string[]; signal: string | null; status: number | null } {
  const child = join(scratch('closeout-doors-'), 'child.mjs');
  writeFileSync(child, source);
  try {
    const out = execFileSync(process.execPath, [child], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000 });
    return { lines: out.split('\n').filter(Boolean), signal: null, status: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; signal?: string | null; status?: number | null };
    return { lines: (failure.stdout ?? '').split('\n').filter(Boolean), signal: failure.signal ?? null, status: failure.status ?? null };
  }
}

/** A child that registers one handler through each door, then ends the way `ending` says. */
const bothDoors = (ending: string): string =>
  [
    "import { createRequire } from 'node:module';",
    "import { writeSync } from 'node:fs';",
    `const es = await import(${JSON.stringify(esDoor.href)});`,
    `const cjs = createRequire(import.meta.url)(${JSON.stringify(fileURLToPath(cjsDoor))});`,
    // fd 1 written synchronously: a process killed by a signal loses nothing queued.
    "es.onExit((code, signal) => { writeSync(1, `es ${code} ${signal}\\n`); });",
    "cjs.onExit((code, signal) => { writeSync(1, `cjs ${code} ${signal}\\n`); });",
    ending,
  ].join('\n');

describe('the two doors of closeout/signal-exit', () => {
  it('import reaches an ES file and require() the CommonJS one', () => {
    expect(doors['import'], 'the ES door').toMatch(/^\.\/dist\/signal-exit\.js$/);
    expect(doors['require'], 'the CommonJS door').toMatch(/^\.\/dist\/signal-exit\.cjs$/);
    // The ES door carries no CommonJS: no `require(` anywhere it reaches is the whole point.
    expect(readFileSync(esDoor, 'utf8')).not.toMatch(/\brequire\(/);
  });

  it('answer with the same names and the same signal list', async () => {
    // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the built ES door, located through the exports map, is what is under test
    const es = (await import(esDoor.href)) as Record<string, unknown>;
    const cjs = createRequire(import.meta.url)(fileURLToPath(cjsDoor)) as Record<string, unknown>;
    expect(Object.keys(es).filter((k) => k !== 'default').sort()).toEqual(Object.keys(cjs).sort());
    expect(es['signals']).toEqual(cjs['signals']);
    expect(es['signals']).toEqual(signalsOn(process.platform));
  });

  it(
    'share one emitter: an exit runs each door’s handler once, in registration order',
    () => {
      const { lines, status } = runChild(bothDoors('process.exitCode = 3;'));
      expect(lines).toEqual(['es 3 null', 'cjs 3 null']);
      expect(status).toBe(3);
    },
    CASE_TIMEOUT_MS,
  );

  it.skipIf(process.platform === 'win32')(
    'share one emitter: a fatal signal runs each handler once and the process still dies of it, once',
    () => {
      const { lines, signal } = runChild(bothDoors("process.kill(process.pid, 'SIGHUP'); setTimeout(() => {}, 5000);"));
      expect(lines).toEqual(['es null SIGHUP', 'cjs null SIGHUP']);
      expect(signal).toBe('SIGHUP');
    },
    CASE_TIMEOUT_MS,
  );
});

describe('signalsOn, the one copy of the list', () => {
  it.each([
    ['win32', 3],
    ['darwin', 13],
    ['linux', 17],
  ])('lists %s’s fatal signals in signal-exit’s order', (platform, length) => {
    const list = signalsOn(platform);
    expect(list).toHaveLength(length);
    expect(list.slice(0, 3)).toEqual(['SIGHUP', 'SIGINT', 'SIGTERM']);
  });

  it('reads the ambient platform when it is not told one', () => {
    expect(signalsOn()).toEqual(signalsOn(process.platform));
  });
});
