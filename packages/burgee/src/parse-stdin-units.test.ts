/**
 * `runParseHooks` (`parse-hooks.ts`), `stdinFor` (`stdin-dash.ts`) and meow's `own`
 * (`meow/types.ts`), each by hand: the edges their callers never reach in the whole-run tests.
 */
import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { type ArgumentSpec } from './manifest.js';
import { own } from './meow/types.js';
import { runParseHooks } from './parse-hooks.js';
import { type Plugin } from './plugin.js';
import { stdinFor } from './stdin-dash.js';

describe('runParseHooks', () => {
  it('passes over a plugin with no hooks, and matches a filter against the words joined by spaces', async () => {
    const plugins = [{ name: 'bare' }, { name: 'p', hooks: { parse: { filter: { command: /^remote add$/ }, handler: () => ['remote', 'add', '--yes'] } } }] as unknown as Plugin[];
    expect(await runParseHooks(plugins, ['remote', 'add'])).toEqual(['remote', 'add', '--yes']);
  });

  it('refuses a returned list that is not all strings', async () => {
    const plugins = [{ name: 'p', hooks: { parse: { handler: () => ['a', 1] } } }] as unknown as Plugin[];
    await expect(runParseHooks(plugins, ['x'])).rejects.toThrow('burgee: plugin "p"\'s parse hook returned object; return string[] or nothing');
  });
});

describe('stdinFor', () => {
  const stdin = new PassThrough();

  it('covers every position past a variadic file argument from the last argument', () => {
    const args = [
      { name: 'name', type: 'string' },
      { name: 'files', type: 'file', variadic: true },
    ] as ArgumentSpec[];
    expect(stdinFor(args, ['x', 'y', '-'], stdin)).toEqual({ stdin });
  });

  it('reads no stdin for a command with no arguments', () => {
    expect(stdinFor([], ['-'], stdin)).toEqual({});
  });

  it('says what to pass when - names two file arguments', () => {
    const args = [{ name: 'files', type: 'file', variadic: true }] as ArgumentSpec[];
    expect(() => stdinFor(args, ['-', '-'], stdin)).toThrow(
      expect.objectContaining({ message: '"-" was given for 2 file arguments, and standard input can be read once', hint: 'pass a path for all but one of them' }),
    );
  });
});

describe('own', () => {
  it('sets a property that can be written, listed and deleted', () => {
    const target: Record<string, unknown> = {};
    own(target, '__proto__', 1);
    target['__proto__'] = 2;
    expect(Object.keys(target)).toEqual(['__proto__']);
    expect(target['__proto__']).toBe(2);
    expect(delete target['__proto__']).toBe(true);
  });
});
