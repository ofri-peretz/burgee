/**
 * Each refusal `validate` (`plugin.ts`) writes, read whole: its class name, code, message and fix.
 * `plugin.test.ts` pins which plugins are refused; this file pins what the author is told.
 */
import { describe, expect, it } from 'vitest';

import { definePlugin, PluginError, validate } from './plugin.js';

/** What `fn` threw, as the four fields a plugin author reads. */
function told(fn: () => unknown): { name: string; code?: string; message: string; fix?: string } {
  try {
    fn();
  } catch (error) {
    const { name, code, message, fix } = error as PluginError;
    return { name, code, message, fix };
  }
  throw new Error('nothing was refused');
}

const handler = (): void => undefined;

describe('the refusals validate writes', () => {
  it('names the class, and tells a non-object what to export', () => {
    expect(told(() => validate([]))).toEqual({ name: 'PluginError', code: 'E_PLUGIN_SCHEMA', message: 'a plugin is a plain object', fix: 'export an object, not a function or an array' });
  });

  it('asks for a name', () => {
    expect(told(() => validate({ name: '' })).fix).toBe('add `name: "…"` — it is what a contributed command is attributed to');
    expect(told(() => validate({ name: '' })).message).toBe('a plugin needs a name');
  });

  it('refuses a contract that is not a whole number from 1 to the one it knows', () => {
    for (const contract of [Number.NaN, '1', 0, -1, 1.5, 2]) {
      expect(told(() => validate({ name: 'p', contract }))).toEqual({
        name: 'PluginError',
        code: 'E_PLUGIN_CONTRACT',
        message: `plugin "p" declares contract ${String(contract)}; this burgee knows 1`,
        fix: 'upgrade burgee, or lower the plugin’s contract',
      });
    }
  });

  it('lists the enforce spellings it takes', () => {
    expect(told(() => validate({ name: 'p', contract: 1, enforce: 'mid' }))).toMatchObject({ message: 'plugin "p": "mid" is not an enforce', fix: 'use pre or post, or leave it out' });
  });

  it('refuses hooks that are not an object before reading their stages', () => {
    expect(told(() => validate({ name: 'p', contract: 1, hooks: 'x' }))).toMatchObject({
      message: 'plugin "p": hooks must be an object',
      fix: 'map a stage to a hook: `{ preRun: { filter?, handler } }`',
    });
    expect(told(() => validate({ name: 'p', contract: 1, hooks: { later: { handler } } }))).toMatchObject({
      message: 'plugin "p": "later" is not a hook stage',
      fix: 'use one of parse, preRun, postRun, onError, shutdown',
    });
  });

  it('refuses a null hook with its own refusal, not a TypeError', () => {
    expect(told(() => validate({ name: 'p', contract: 1, hooks: { preRun: null } }))).toMatchObject({
      code: 'E_PLUGIN_SCHEMA',
      message: 'plugin "p": preRun is not { handler, filter?: { command: RegExp } }',
      fix: '`preRun: { handler(ctx) {}, filter?: { command: /^deploy/ } }`',
    });
  });

  it('names the command by its index, and its words joined by spaces', () => {
    expect(told(() => validate({ name: 'p', contract: 1, commands: {} }))).toMatchObject({
      message: 'plugin "p": commands must be an array',
      fix: 'list them in an array of `{ path, options, … }` nodes',
    });
    expect(told(() => validate({ name: 'p', contract: 1, commands: [{ path: [] }] }))).toMatchObject({
      message: 'plugin "p": commands[0] has no path',
      fix: 'add `path: ["…"]` — the words a user types',
    });
    expect(told(() => validate({ name: 'p', contract: 1, commands: [{ path: ['remote', 'add'] }] }, ['remote add']))).toMatchObject({
      message: 'plugin "p": commands[0] contributes "remote add", which is already declared',
    });
  });

  it('refuses a plugin that contributes the same path twice', () => {
    const node = { path: ['go'], effects: 'read_only', options: {}, run: handler };
    expect(told(() => validate({ name: 'p', contract: 1, commands: [node, { ...node }] }))).toMatchObject({
      message: 'plugin "p": commands[1] contributes "go", which is already declared',
      fix: 'rename it — find() answers the first node on a path and resolve() the last',
    });
  });

  it('validates what definePlugin stamps', () => {
    expect(told(() => definePlugin({ name: '' } as never))).toMatchObject({ code: 'E_PLUGIN_SCHEMA', message: 'a plugin needs a name' });
  });
});
