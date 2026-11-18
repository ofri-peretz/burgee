import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { applyPlan, readDisk, writeAtomic } from './run-apply.js';


const scratch = scratchDirs();
const temp = (): string => scratch('apicontract-apply-');

describe('readDisk', () => {
  it('reads the paths that have a file and leaves out the rest', () => {
    const root = temp();
    writeFileSync(join(root, 'a.ts'), 'A');
    expect([...readDisk(root, ['a.ts', 'b.ts'])]).toEqual([['a.ts', 'A']]);
  });
});

describe('writeAtomic', () => {
  it('creates the folders, writes the bytes, and leaves no temporary file', () => {
    const root = temp();
    writeAtomic(join(root, 'a/b/c.ts'), 'C');
    writeAtomic(join(root, 'a/b/c.ts'), 'C2');
    expect(readFileSync(join(root, 'a/b/c.ts'), 'utf8')).toBe('C2');
    expect(readdirSync(join(root, 'a/b'))).toEqual(['c.ts']);
  });
});

describe('applyPlan', () => {
  it('writes the writes, deletes the deletes, and leaves every other entry alone', () => {
    const root = temp();
    for (const name of ['old.ts', 'same.ts', 'mine.ts', 'edited.ts']) writeFileSync(join(root, name), name);
    applyPlan(root, [
      { path: 'new/a.ts', owner: 'generated', action: 'write', before: undefined, after: 'A' },
      { path: 'old.ts', owner: 'generated', action: 'delete', before: 'old.ts', after: undefined },
      { path: 'same.ts', owner: 'generated', action: 'unchanged', before: 'same.ts', after: 'X' },
      { path: 'mine.ts', owner: 'user', action: 'skip', before: 'mine.ts', after: 'X' },
      { path: 'edited.ts', owner: 'generated', action: 'conflict', before: 'edited.ts', after: 'X' },
    ]);
    expect(readFileSync(join(root, 'new/a.ts'), 'utf8')).toBe('A');
    expect(existsSync(join(root, 'old.ts'))).toBe(false);
    for (const name of ['same.ts', 'mine.ts', 'edited.ts']) expect(readFileSync(join(root, name), 'utf8')).toBe(name);
  });
});
