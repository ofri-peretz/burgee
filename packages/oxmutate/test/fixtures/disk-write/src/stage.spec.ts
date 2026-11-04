import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { shout, stage, stagingOf } from './stage.js';

it('stages beside the live directory', () => {
  const live = path.join(mkdtempSync(path.join(tmpdir(), 'disk-write-')), 'suite');
  stage(live);
  expect(stagingOf(live)).toBe(`${live}.staging`);
});

// A suite that reads its own project: a stray file there fails it, under any mutant that runs after
// the write, so without the guard every later verdict is a false kill.
it('leaves the project as it found it', () => {
  shout('hi');
  expect(existsSync(path.join(import.meta.dirname, '..', 'copy'))).toBe(false);
});
