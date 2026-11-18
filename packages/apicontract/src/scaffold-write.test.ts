import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, it } from 'vitest';

import { writeFiles } from './scaffold-write.js';

const directory = mkdtempSync(join(tmpdir(), 'apicontract-write-'));

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

it('writes what is missing, leaves what is equal, and keeps a user file with other bytes', async () => {
  writeFileSync(join(directory, 'same.ts'), 'same');
  writeFileSync(join(directory, 'mine.ts'), 'edited');
  const result = await writeFiles(directory, [
    { path: 'deep/new.ts', owner: 'user', content: 'new' },
    { path: 'same.ts', owner: 'user', content: 'same' },
    { path: 'mine.ts', owner: 'user', content: 'scaffold' },
  ]);
  expect(result).toEqual({ written: ['deep/new.ts'], unchanged: ['same.ts'], kept: ['mine.ts'] });
  expect(readFileSync(join(directory, 'deep/new.ts'), 'utf8')).toBe('new');
  expect(readFileSync(join(directory, 'mine.ts'), 'utf8')).toBe('edited');
});

it('creates the directory it is given', async () => {
  const nested = join(directory, 'a', 'b');
  expect(await writeFiles(nested, [{ path: 'x.ts', owner: 'user', content: 'x' }])).toEqual({ written: ['x.ts'], unchanged: [], kept: [] });
  expect(readFileSync(join(nested, 'x.ts'), 'utf8')).toBe('x');
});
