/**
 * The refusals and the shapes `plugin.test.ts` does not reach: each malformed `widgets`,
 * `frame` and `sample`, and a plugin that carries no `widgets` at all — which is every plugin
 * written for another layer of the family, and must register here as contributing nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { kinds, PluginError, projectionOf, register, registered, reset, widgetFor, widgets } from './plugin.js';

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

/** What `register(plugin)` threw: the error's name, its code, its message and its fix. */
function thrown(plugin: unknown): { name: string; code: string; message: string; fix: string } {
  try {
    register(plugin);
  } catch (error) {
    const { name, code, message, fix } = error as PluginError;
    return { name, code, message, fix };
  }
  throw new Error('register() accepted the plugin');
}

const SIX = 'text, confirm, select, multiselect, password, path';

describe('every refusal says what to do about it', () => {
  it.each<[string, unknown, string, string, string]>([
    ['null', null, 'E_PLUGIN_SCHEMA', 'a plugin is a plain object', 'export an object, not a function or an array'],
    ['an array', [], 'E_PLUGIN_SCHEMA', 'a plugin is a plain object', 'export an object, not a function or an array'],
    ['a function', staticOnly.static, 'E_PLUGIN_SCHEMA', 'a plugin is a plain object', 'export an object, not a function or an array'],
    ['no name', {}, 'E_PLUGIN_SCHEMA', 'a plugin needs a name', 'add `name: "…"` — it is how a shadowed widget is reported'],
    ['an empty name', { name: '' }, 'E_PLUGIN_SCHEMA', 'a plugin needs a name', 'add `name: "…"` — it is how a shadowed widget is reported'],
    ['a newer contract', { name: 'acme', contract: 99 }, 'E_PLUGIN_CONTRACT', 'plugin "acme" declares contract 99; this caique knows 1', 'upgrade caique, or lower the plugin’s contract'],
    ['widgets that are not an object', { name: 'acme', widgets: [] }, 'E_PLUGIN_SCHEMA', 'plugin "acme": widgets must be an object', 'map a prompt kind to a widget: `{ static, frame?, sample? }`'],
    ['widgets that are null', { name: 'acme', widgets: null }, 'E_PLUGIN_SCHEMA', 'plugin "acme": widgets must be an object', 'map a prompt kind to a widget: `{ static, frame?, sample? }`'],
    ['an empty kind', { name: 'acme', widgets: { '': staticOnly } }, 'E_PLUGIN_SCHEMA', 'plugin "acme": a widget’s kind is empty', 'name the kind — it is what a `PromptSpec` sets as `kind`'],
    ['a built-in kind', { name: 'acme', widgets: { password: staticOnly } }, 'E_PLUGIN_SCHEMA', 'plugin "acme": "password" is a built-in prompt kind', `caique draws the six itself (${SIX}); name a kind of your own`],
    ['a widget that is not an object', { name: 'acme', widgets: { k: 'x' } }, 'E_PLUGIN_SCHEMA', 'plugin "acme": widget "k" is not an object', 'a widget is `{ static, frame?, sample? }`'],
    ['a frame that is not a function', { name: 'acme', widgets: { k: { ...staticOnly, frame: 1 } } }, 'E_PLUGIN_SCHEMA', 'plugin "acme": widget "k" has a `frame` that is not a function', 'a frame is `(t, spec) => "…"`, or leave it out and the widget is line-mode only'],
    ['a malformed sample', { name: 'acme', widgets: { k: { ...staticOnly, sample: { running: 1 } } } }, 'E_PLUGIN_SCHEMA', 'plugin "acme": widget "k" has a malformed `sample`', 'a sample is `{ running, done }` — two named states of plain data, which a grader renders the widget with'],
  ])('refuses %s', (...[, plugin, code, message, fix]) => {
    expect(thrown(plugin)).toEqual({ name: 'PluginError', code, message, fix });
  });

  it('refuses an unknown kind naming every kind registered, and the six', () => {
    register({ name: 'acme', widgets: { 'acme-a': staticOnly, 'acme-b': staticOnly } });
    expect(() => projectionOf({ kind: 'acme-c', message: 'm' })).toThrow(
      expect.objectContaining({ code: 'E_UNKNOWN_KIND', message: 'no widget draws prompt kind "acme-c" — registered kinds: acme-a, acme-b', fix: `register a plugin whose \`widgets\` defines "acme-c", or use a built-in kind: ${SIX}` }) as Error,
    );
  });
});

describe('finding the widget for a kind', () => {
  it('passes over later plugins that do not draw it, or draw nothing at all', () => {
    const first = { static: (): string => 'first' };
    register({ name: 'acme', widgets: { k: first } });
    register({ name: 'other', widgets: { j: staticOnly } });
    register({ name: 'tokens-only' });
    expect(widgetFor('k')).toBe(first);
    expect(widgetFor('nothing')).toBeUndefined();
  });

  it('starts with nothing registered', async () => {
    vi.resetModules();
    const fresh = await import('./plugin.js');
    expect(fresh.registered()).toEqual([]);
  });
});

