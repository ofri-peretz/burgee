import { describe, expect, it } from 'vitest';

import { type GeneratedFile } from './host.js';
import { digest, withHeader } from './run-header.js';
import { changes, plan } from './run-plan.js';

const command = 'apicontract gen';
const gen = (path: string, content: string): GeneratedFile => ({ path, content, owner: 'generated' });
const user = (path: string, content: string): GeneratedFile => ({ path, content, owner: 'user' });
const written = (path: string, body: string): string => withHeader(path, body, command);
const disk = (entries: Record<string, string>): Map<string, string> => new Map(Object.entries(entries));

describe('plan', () => {
  it('writes every file of a first run, header on the generated ones only', () => {
    expect(plan([gen('a.ts', 'A\n'), user('b.ts', 'B\n')], disk({}), { command })).toEqual([
      { path: 'a.ts', owner: 'generated', action: 'write', before: undefined, after: written('a.ts', 'A\n') },
      { path: 'b.ts', owner: 'user', action: 'write', before: undefined, after: 'B\n' },
    ]);
  });

  it('leaves a generated file that already holds the same bytes', () => {
    const [entry] = plan([gen('a.ts', 'A\n')], disk({ 'a.ts': written('a.ts', 'A\n') }), { command });
    expect(entry?.action).toBe('unchanged');
  });

  it('skips a user file that exists, whatever it holds', () => {
    expect(plan([user('b.ts', 'B\n')], disk({ 'b.ts': 'mine\n' }), { command })).toEqual([{ path: 'b.ts', owner: 'user', action: 'skip', before: 'mine\n', after: 'mine\n' }]);
  });

  it('rewrites a generated file when the spec changed and nobody edited it', () => {
    const [entry] = plan([gen('a.ts', 'A2\n')], disk({ 'a.ts': written('a.ts', 'A1\n') }), { command });
    expect(entry).toEqual({ path: 'a.ts', owner: 'generated', action: 'write', before: written('a.ts', 'A1\n'), after: written('a.ts', 'A2\n') });
  });

  it('rewrites a generated file whose header names another command', () => {
    const [entry] = plan([gen('a.ts', 'A\n')], disk({ 'a.ts': withHeader('a.ts', 'A\n', 'apicontract extract') }), { command });
    expect(entry?.action).toBe('write');
  });

  it('refuses to overwrite a hand edit below the header', () => {
    const edited = written('a.ts', 'A1\n').replace('A1', 'A1 // mine');
    expect(plan([gen('a.ts', 'A2\n')], disk({ 'a.ts': edited }), { command })[0]?.action).toBe('conflict');
  });

  it('refuses to overwrite a file at a generated path that apicontract never wrote', () => {
    expect(plan([gen('a.ts', 'A\n')], disk({ 'a.ts': 'export {};\n' }), { command })[0]?.action).toBe('conflict');
  });

  it('overwrites either with --force', () => {
    const entries = plan([gen('a.ts', 'A\n'), gen('b.ts', 'B\n')], disk({ 'a.ts': 'x', 'b.ts': written('b.ts', 'B0\n').replace('B0', 'B9') }), { command, force: true });
    expect(entries.map((e) => e.action)).toEqual(['write', 'write']);
  });

  it('knows a file without comments by the hash the map recorded', () => {
    const recorded = new Map([['s.json', digest('{"v":1}\n')]]);
    expect(plan([gen('s.json', '{"v":2}\n')], disk({ 's.json': '{"v":1}\n' }), { command, recorded })[0]?.action).toBe('write');
    expect(plan([gen('s.json', '{"v":2}\n')], disk({ 's.json': '{"v":1, "mine":1}\n' }), { command, recorded })[0]?.action).toBe('conflict');
    expect(plan([gen('s.json', '{"v":2}\n')], disk({ 's.json': '{"v":1}\n' }), { command })[0]?.action).toBe('conflict');
  });

  it('does not trust a recorded hash for a file that has a header', () => {
    const edited = written('a.ts', 'A1\n').replace('A1', 'A9');
    const recorded = new Map([['a.ts', digest(edited)]]);
    expect(plan([gen('a.ts', 'A2\n')], disk({ 'a.ts': edited }), { command, recorded })[0]?.action).toBe('conflict');
  });

  it('deletes a generated file the previous run wrote and this one does not, when nobody edited it', () => {
    const recorded = new Map([['old.ts', digest('O\n')], ['gone.ts', digest('G\n')], ['a.ts', digest('A\n')]]);
    const entries = plan([gen('a.ts', 'A\n')], disk({ 'a.ts': written('a.ts', 'A\n'), 'old.ts': written('old.ts', 'O\n') }), { command, recorded });
    expect(entries).toEqual([
      { path: 'a.ts', owner: 'generated', action: 'unchanged', before: written('a.ts', 'A\n'), after: written('a.ts', 'A\n') },
      { path: 'old.ts', owner: 'generated', action: 'delete', before: written('old.ts', 'O\n'), after: undefined },
    ]);
  });

  it('refuses to delete an edited one, unless forced; and never touches a path no map recorded', () => {
    const recorded = new Map([['old.json', digest('{}\n')]]);
    expect(plan([], disk({ 'old.json': '{"mine":1}\n', 'other.ts': 'x' }), { command, recorded }).map((e) => e.action)).toEqual(['conflict']);
    expect(plan([], disk({ 'old.json': '{"mine":1}\n' }), { command, recorded, force: true }).map((e) => e.action)).toEqual(['delete']);
    expect(plan([], disk({ 'old.json': '{}\n' }), { command, recorded }).map((e) => e.action)).toEqual(['delete']);
  });

  it('sorts by path', () => {
    expect(plan([gen('c.ts', ''), user('a.ts', ''), gen('b.ts', '')], disk({}), { command }).map((e) => e.path)).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });
});

describe('changes', () => {
  it('keeps the writes and the deletes', () => {
    const recorded = new Map([['old.ts', digest('O\n')]]);
    const entries = plan([gen('w.ts', 'W\n'), gen('u.ts', 'U\n'), user('s.ts', ''), gen('c.ts', 'C\n')], disk({ 'u.ts': written('u.ts', 'U\n'), 's.ts': '', 'c.ts': 'x', 'old.ts': written('old.ts', 'O\n') }), { command, recorded });
    expect(entries.map((e) => `${e.path}:${e.action}`)).toEqual(['c.ts:conflict', 'old.ts:delete', 's.ts:skip', 'u.ts:unchanged', 'w.ts:write']);
    expect(changes(entries).map((e) => e.path)).toEqual(['old.ts', 'w.ts']);
  });
});
