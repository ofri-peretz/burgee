/**
 * The refusals and the shapes `plugin.test.ts` does not reach: each malformed `widgets`,
 * `frame` and `sample`, and a plugin that carries no `widgets` at all — which is every plugin
 * written for another layer of the family, and must register here as contributing nothing.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { kinds, register, registered, reset, widgets } from './plugin.js';

const staticOnly = { static: (): string => 'drawn' };

/** Registers `plugin` and returns what it was refused with: the code and the message. */
function refusal(plugin: unknown): { code: unknown; message: unknown } {
  try {
    register(plugin);
  } catch (error) {
    return { code: (error as { code: unknown }).code, message: (error as Error).message };
  }
  throw new Error('register() accepted the plugin');
}

beforeEach(() => {
  reset();
});

describe('a plugin without `widgets`', () => {
  it('registers, and contributes no kind — its keys belong to another layer (R1)', () => {
    register({ name: 'tokens-only', tokens: { error: '#b3261e' } });
    expect(registered().map((p) => p.name)).toEqual(['tokens-only']);
    expect(widgets()).toEqual([]);
  });

  it('sits beside one that has them without hiding them', () => {
    register({ name: 'tokens-only' });
    register({ name: 'acme', widgets: { 'acme-rating': staticOnly } });
    register({ name: 'glyphs-only' });
    expect(widgets()).toEqual([{ kind: 'acme-rating', from: 'acme', shadowed: [] }]);
    expect(kinds().at(-1)).toBe('acme-rating');
  });
});

describe('a malformed `widgets` is refused with E_PLUGIN_SCHEMA, naming what is wrong', () => {
  it('when `widgets` is not an object', () => {
    expect(refusal({ name: 'acme', widgets: ['acme-rating'] })).toEqual({ code: 'E_PLUGIN_SCHEMA', message: 'plugin "acme": widgets must be an object' });
  });

  it('when a kind is the empty string', () => {
    expect(refusal({ name: 'acme', widgets: { '': staticOnly } })).toEqual({ code: 'E_PLUGIN_SCHEMA', message: 'plugin "acme": a widget’s kind is empty' });
  });

  it('when a widget is not an object', () => {
    expect(refusal({ name: 'acme', widgets: { 'acme-rating': (): string => 'drawn' } })).toEqual({ code: 'E_PLUGIN_SCHEMA', message: 'plugin "acme": widget "acme-rating" is not an object' });
  });

  it('when `frame` is there but is not a function', () => {
    expect(refusal({ name: 'acme', widgets: { 'acme-rating': { ...staticOnly, frame: 'spin' } } })).toEqual({
      code: 'E_PLUGIN_SCHEMA',
      message: 'plugin "acme": widget "acme-rating" has a `frame` that is not a function',
    });
  });

  it.each([
    ['not an object', 'asking'],
    ['missing `done`', { running: {} }],
    ['missing `running`', { done: {} }],
  ])('when `sample` is %s', (_why, sample) => {
    expect(refusal({ name: 'acme', widgets: { 'acme-rating': { ...staticOnly, sample } } })).toEqual({
      code: 'E_PLUGIN_SCHEMA',
      message: 'plugin "acme": widget "acme-rating" has a malformed `sample`',
    });
  });

  it('and a refused widget leaves nothing registered', () => {
    refusal({ name: 'acme', widgets: { 'acme-rating': { ...staticOnly, sample: { running: {} } } } });
    expect(registered()).toEqual([]);
  });
});
