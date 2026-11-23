import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/kit/scratch-dir.js';
import { writeFiles } from './scaffold-write.js';

const scratch = scratchDirs();
const directory = scratch('apicontract-write-');


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
