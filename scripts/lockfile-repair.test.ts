/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `scripts/lockfile-repair.ts` is the hand repair of #1429 and #1438 as one command. The fixture is
 * the incident itself: this repo's committed lock with the entries an npm 11.6.2 regeneration
 * prunes taken out. A repair is right only if it gives back the committed file byte for byte,
 * so the diff it leaves is the restored entries and nothing else.
 *
 * Proven red first: against a stub `repair` that returns its input unchanged and reports nothing,
 * all five cases failed, each on its own assertion.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { repair } from './lockfile-repair.js';
import { type Lock, unresolved } from './lockfile-resolves.js';
import { discard } from './scratch-dir.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK_BUFFER_BYTES = 64 * 1024 * 1024;
const entry = (fields: object): Lock['packages'][string] => fields;
const write = (lock: Lock): string => `${JSON.stringify(lock, null, 2)}\n`;

/**
 * The hoisted consumer of `@emnapi/{core,runtime}` that #1438 broke. It was
 * `@tailwindcss/oxide-wasm32-wasi`; from tailwindcss 4.3.5 that package bundles its own copies
 * (`inBundle`), so nothing hoisted resolves to `node_modules/@emnapi/core` and pruning it dangles
 * nothing. The fixture keeps the incident's shape with a consumer of its own, whatever the
 * committed lock's tailwind does.
 */
const CONSUMER = 'node_modules/@fixture/emnapi-consumer';
const committedLock = JSON.parse(execFileSync('git', ['show', 'HEAD:package-lock.json'], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: LOCK_BUFFER_BYTES })) as Lock;
committedLock.packages[CONSUMER] = entry({ version: '1.0.0', dependencies: { '@emnapi/core': '^1.11.1', '@emnapi/runtime': '^1.11.1', '@emnapi/wasi-threads': '^1.2.2' } });
const committedText = write(committedLock);
const committed = (): Lock => JSON.parse(committedText) as Lock;

/**
 * The committed lock with the hoisted entry of each named package removed. That is exactly what
 * npm 11.6.2 did in #1438: `node_modules/@emnapi/{core,runtime}` went, and the copies nested under
 * `@oxc-resolver/binding-wasm32-wasi` stayed.
 */
function pruned(...names: string[]): Lock {
  const lock = committed();
  for (const n of names) {
    expect(lock.packages, `the committed lock has no node_modules/${n} to prune`).toHaveProperty([`node_modules/${n}`]);
    delete lock.packages[`node_modules/${n}`];
  }
  return lock;
}

describe('repairs the lock npm 11.6.2 wrote', () => {
  it('gives back the committed file byte for byte from the #1438 prune', () => {
    const broken = pruned('@emnapi/core', '@emnapi/runtime');
    expect(unresolved(broken), 'the fixture must be the incident: both @emnapi entries dangling').not.toEqual([]);
    const result = repair(broken, committed());
    expect(result.restored.map((r) => r.path).sort()).toEqual(['node_modules/@emnapi/core', 'node_modules/@emnapi/runtime']);
    expect(result.unrepairable).toEqual([]);
    expect(write(result.lock)).toBe(committedText);
  });

  it('follows a restored entry to what it declares in turn', () => {
    // @emnapi/core declares @emnapi/wasi-threads: once core is back, wasi-threads dangles too.
    const result = repair(pruned('@emnapi/core', '@emnapi/runtime', '@emnapi/wasi-threads'), committed());
    expect(result.restored.map((r) => r.path)).toEqual(expect.arrayContaining(['node_modules/@emnapi/core', 'node_modules/@emnapi/wasi-threads']));
    expect(write(result.lock)).toBe(committedText);
  });
});

describe('copies what node would resolve, and says what it cannot', () => {
  const ref: Lock = {
    packages: {
      '': entry({ dependencies: { a: '^1.0.0', b: '^1.0.0' } }),
      'node_modules/a': entry({ version: '1.0.0', dependencies: { b: '^2.0.0' } }),
      'node_modules/a/node_modules/b': entry({ version: '2.0.0' }),
      'node_modules/b': entry({ version: '1.0.0' }),
    },
  };

  it("takes the path node reaches first from the declarer, not the hoisted one", () => {
    // Both copies of b are gone: a needs its nested 2.0.0, the root its hoisted 1.0.0.
    const result = repair({ packages: { '': ref.packages['']!, 'node_modules/a': ref.packages['node_modules/a']! } }, ref);
    expect(result.restored).toEqual(
      expect.arrayContaining([
        { path: 'node_modules/a/node_modules/b', version: '2.0.0' },
        { path: 'node_modules/b', version: '1.0.0' },
      ]),
    );
    expect(Object.keys(result.lock.packages)).toEqual(['', 'node_modules/a', 'node_modules/a/node_modules/b', 'node_modules/b']);
  });

  it('reports a name the reference lacks too, and copies nothing for it', () => {
    const result = repair({ packages: { '': entry({}), 'node_modules/a': entry({ dependencies: { c: '^1.0.0' } }) } }, ref);
    expect(result.restored).toEqual([]);
    expect(result.unrepairable).toEqual(['node_modules/a -> c']);
  });
});

describe('the command', () => {
  it('rewrites the file in place, and lockfile-resolves then passes it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lockfile-repair-'));
    try {
      const lock = join(dir, 'package-lock.json');
      const reference = join(dir, 'reference.json');
      writeFileSync(lock, write(pruned('@emnapi/core', '@emnapi/runtime')));
      writeFileSync(reference, committedText);
      const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/lockfile-repair.ts', lock, reference], { cwd: REPO_ROOT, encoding: 'utf8' });
      expect(run.status, run.stderr).toBe(0);
      expect(run.stdout).toContain('restored node_modules/@emnapi/core@');
      expect(readFileSync(lock, 'utf8')).toBe(committedText);
      expect(spawnSync(process.execPath, ['--no-warnings', 'scripts/lockfile-resolves.ts', lock], { cwd: REPO_ROOT }).status).toBe(0);
    } finally {
      discard(dir);
    }
  });
});
