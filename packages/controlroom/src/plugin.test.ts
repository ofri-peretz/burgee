import { describe, expect, it } from 'vitest';

import { CONTRACT, PluginError, register, registered, reset, validate } from './plugin.js';

const refusal = (plugin: unknown): PluginError => {
  try {
    validate(plugin);
  } catch (error) {
    return error as PluginError;
  }
  throw new Error('expected a refusal');
};

describe('validate', () => {
  it('accepts a keymap and a pane as data', () => {
    expect(() => validate({ name: 'p', contract: CONTRACT, keymaps: { vim: { keys: { h: 'tab.prev' }, labels: { 'tab.prev': 'switch' } } }, panes: { log: { component: 'log-tail', label: 'Log' } } })).not.toThrow();
    expect(() => validate({ name: 'only-a-name' })).not.toThrow();
  });

  it.each([
    [null, /non-empty `name`/u],
    [{ name: '' }, /non-empty `name`/u],
    [{ name: 'p', keymaps: [] }, /`keymaps` must be an object/u],
    [{ name: 'p', panes: 'x' }, /`panes` must be an object/u],
    [{ name: 'p', keymaps: { k: { keys: { h: 1 } } } }, /keymaps\.k\.keys must map/u],
    [{ name: 'p', keymaps: { k: null } }, /keymaps\.k\.keys must map/u],
    [{ name: 'p', keymaps: { k: { keys: {}, labels: { a: '' } } } }, /keymaps\.k\.labels must map/u],
    [{ name: 'p', panes: { a: { component: '' } } }, /panes\.a must name/u],
    [{ name: 'p', panes: { a: 7 } }, /panes\.a must name/u],
    [{ name: 'p', panes: { a: { component: 'x', label: 3 } } }, /panes\.a\.label must be a string/u],
  ])('refuses %j with E_PLUGIN_SCHEMA and a fix', (plugin, message) => {
    const error = refusal(plugin);
    expect(error.code).toBe('E_PLUGIN_SCHEMA');
    expect(error.message).toMatch(message);
    expect(error.fix).not.toBe('');
  });

  it('a key spec caique cannot read is refused with caique’s own fix', () => {
    const error = refusal({ name: 'p', keymaps: { k: { keys: { 'ctrl+nothing-real': 'x' } } } });
    expect(error.code).toBe('E_PLUGIN_SCHEMA');
    expect(error.message).toMatch(/keymaps\.k: .*does not name a key/u);
    expect(error.fix).toMatch(/\[ctrl\+\]/u);
  });

  it('a newer contract is refused with E_PLUGIN_CONTRACT', () => {
    expect(refusal({ name: 'p', contract: CONTRACT + 1 }).code).toBe('E_PLUGIN_CONTRACT');
  });
});

describe('register and registered', () => {
  it('the built-in default keymap is there before anyone registers, through the same door', () => {
    expect(registered().keymaps.get('default')?.keys).toMatchObject({ left: 'tab.prev', right: 'tab.next', 'ctrl+c': 'quit' });
  });

  it('keeps every keymap and pane, a later entry replaces an earlier one, and the copies cannot write back', () => {
    register({ name: 'a', keymaps: { mine: { keys: { x: 'one' } } }, panes: { log: { component: 'log-tail' } } });
    register({ name: 'b', keymaps: { mine: { keys: { y: 'two' } } } });
    const now = registered();
    expect(now.keymaps.get('mine')?.keys).toEqual({ y: 'two' });
    expect(now.panes.get('log')).toEqual({ component: 'log-tail' });
    now.keymaps.clear();
    expect(registered().keymaps.has('mine')).toBe(true);
    expect(Object.isFrozen(registered().panes.get('log'))).toBe(true);
  });

  it('reset forgets every registration, and the built-in default comes back on the next use', () => {
    register({ name: 'gone', keymaps: { temp: { keys: { t: 'x' } } } });
    reset();
    expect(registered().keymaps.has('temp')).toBe(false);
    expect(registered().keymaps.has('default')).toBe(true);
  });

  it('a refused plugin registers nothing', () => {
    expect(() => register({ name: 'bad', panes: { p: {} } })).toThrow(PluginError);
    expect(registered().panes.has('p')).toBe(false);
  });
});
