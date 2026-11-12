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
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { signalsOn } from './signal-list.js';

const scratch = scratchDirs();
const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as { exports: Record<string, Record<string, string>> };
const doors = manifest.exports['./signal-exit'] ?? {};
const esDoor = new URL(`../${doors['import'] ?? ''}`, import.meta.url);
const cjsDoor = new URL(`../${doors['require'] ?? ''}`, import.meta.url);

interface Death {
  lines: string[];
  signal: NodeJS.Signals | null;
  status: number | null;
}

/**
 * Run a child module to its death; its stdout lines and how it died.
 *
 * Waited for on the child's `close` event, with no clock of its own: under the pre-push battery a
 * node start-up plus two `dist/` imports took seconds, and the 20 s kill this used to carry turned
 * a slow child into one "killed by SIGTERM" — a death the assertions then blamed on the doors. A
 * child that truly hangs is bounded by the hook's timeout (vitest-timeouts.config.ts), and fails.
 * Asynchronous, so the two children below start together and the worker is not blocked meanwhile.
 */
function runChild(source: string): Promise<Death> {
  const file = join(scratch('closeout-doors-'), 'child.mjs');
  writeFileSync(file, source);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (out += chunk));
    child.on('error', reject);
    child.on('close', (status, signal) => resolve({ lines: out.split('\n').filter(Boolean), signal, status }));
  });
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
  // Both children start once, together, before the cases: each case then only reads how its child
  // died, so neither case's own clock measures a node start-up on a busy machine.
  const fatal = process.platform !== 'win32';
  let exited: Death;
  let signalled: Death | undefined;
  beforeAll(async () => {
    [exited, signalled] = await Promise.all([
      runChild(bothDoors('process.exitCode = 3;')),
      fatal ? runChild(bothDoors("process.kill(process.pid, 'SIGHUP'); setTimeout(() => {}, 5000);")) : undefined,
    ]);
  });

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

  it('share one emitter: an exit runs each door’s handler once, in registration order', () => {
    expect(exited.lines).toEqual(['es 3 null', 'cjs 3 null']);
    expect(exited.status).toBe(3);
  });

  it.skipIf(!fatal)('share one emitter: a fatal signal runs each handler once and the process still dies of it, once', () => {
    expect(signalled?.lines).toEqual(['es null SIGHUP', 'cjs null SIGHUP']);
    expect(signalled?.signal).toBe('SIGHUP');
  });
});

describe('signalsOn, the one copy of the list', () => {
  const EVERYWHERE = ['SIGHUP', 'SIGINT', 'SIGTERM'];
  const POSIX = [...EVERYWHERE, 'SIGALRM', 'SIGABRT', 'SIGVTALRM', 'SIGXCPU', 'SIGXFSZ', 'SIGUSR2', 'SIGTRAP', 'SIGSYS', 'SIGQUIT', 'SIGIOT'];

  // Whole arrays, in order: signal-exit's suite snapshots the list, so a renamed or reordered
  // entry is a failed case there.
  it.each([
    ['win32', EVERYWHERE],
    ['darwin', POSIX],
    ['linux', [...POSIX, 'SIGIO', 'SIGPOLL', 'SIGPWR', 'SIGSTKFLT']],
  ])('lists %s’s fatal signals in signal-exit’s order', (platform, expected) => {
    expect(signalsOn(platform)).toEqual(expected);
  });

  it('answers with the POSIX list when there is no platform to read', () => {
    expect(signalsOn(undefined)).toEqual(POSIX);
  });
});
