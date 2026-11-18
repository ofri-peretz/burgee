import { describe, expect, it } from 'vitest';

import { type GeneratedFile } from './host.js';
import { plan, unsafe } from './testing-owner.js';

const generated = (path: string, content: string): GeneratedFile => ({ path, content, owner: 'generated' });
const user = (path: string, content: string): GeneratedFile => ({ path, content, owner: 'user' });

describe('plan, the owner rule', () => {
  it('writes a new file, rewrites a changed generated one, skips a changed user one, and leaves an equal one', () => {
    const disk = new Map([
      ['same.ts', 'a'],
      ['gen.ts', 'old'],
      ['mine.ts', 'old'],
    ]);
    expect(plan([generated('new.ts', 'x'), user('new-user.ts', 'x'), generated('same.ts', 'a'), user('same.ts', 'a'), generated('gen.ts', 'new'), user('mine.ts', 'new')], disk)).toEqual([
      { path: 'new.ts', action: 'write' },
      { path: 'new-user.ts', action: 'write' },
      { path: 'same.ts', action: 'unchanged' },
      { path: 'same.ts', action: 'unchanged' },
      { path: 'gen.ts', action: 'write' },
      { path: 'mine.ts', action: 'skip' },
    ]);
  });

  it('counts an empty file on disk as present', () => {
    expect(plan([user('e.ts', 'x'), user('f.ts', '')], new Map([['e.ts', ''], ['f.ts', '']]))).toEqual([
      { path: 'e.ts', action: 'skip' },
      { path: 'f.ts', action: 'unchanged' },
    ]);
  });
});

describe('unsafe', () => {
  it('names a user file whose bytes change and one that turns generated', () => {
    expect(unsafe([user('a.ts', '1'), user('b.ts', '1'), generated('c.ts', '1'), user('d.ts', '1'), user('e.ts', '1')], [user('a.ts', '2'), generated('b.ts', '2'), generated('c.ts', '2'), user('d.ts', '1'), generated('f.ts', '1')])).toEqual([
      { path: 'a.ts', problem: 'user file changes' },
      { path: 'b.ts', problem: 'user file becomes generated' },
    ]);
  });

  it('leaves a user file the generator stops producing, and a generated one it rewrites', () => {
    expect(unsafe([user('a.ts', '1'), generated('b.ts', '1')], [generated('b.ts', '2')])).toEqual([]);
  });
});
