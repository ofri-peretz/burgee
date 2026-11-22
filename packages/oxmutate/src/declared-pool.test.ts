import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { declaredPool } from './declared-pool.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), '../test/fixtures');

describe('declaredPool', () => {
  it('reads the pool the project’s Vitest config asks for', async () => {
    expect(await declaredPool(path.join(fixtures, 'forks-pool'))).toBe('forks');
  });

  it('reads the config file it is given, resolved against the root', async () => {
    expect(await declaredPool(path.join(fixtures, 'forks-pool'), 'vitest.config.mjs')).toBe('forks');
  });

  it('is undefined when the config names no pool, or there is no config', async () => {
    expect(await declaredPool(path.join(fixtures, 'load-error'))).toBeUndefined();
    const empty = mkdtempSync(path.join(tmpdir(), 'oxmutate-pool-'));
    expect(await declaredPool(empty)).toBeUndefined();
  });

  it('is undefined when the project has no Vite to read the config with, or the config does not load', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oxmutate-pool-'));
    mkdirSync(path.join(dir, 'src'));
    writeFileSync(path.join(dir, 'vitest.config.mjs'), "export default { test: { pool: 'forks' } };\n");
    expect(await declaredPool(dir)).toBeUndefined();
    const broken = path.join(fixtures, 'forks-pool');
    expect(await declaredPool(broken, 'missing.config.mjs')).toBeUndefined();
  });
});
