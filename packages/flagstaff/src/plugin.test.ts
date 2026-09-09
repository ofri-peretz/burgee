/**
 * R2, R3 — a plugin is data, validated at the door, and a contribution without a static
 * projection is refused with a fix; R4 — the built-ins come through the same door; R7 —
 * no layout engine, locked on the file list.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { type Component, CONTRACT, glyph, lookupSpinner, PluginError, register, registered, type SpinnerDef } from './plugin.js';

const src = fileURLToPath(new URL('.', import.meta.url));

function refusal(plugin: unknown): PluginError {
  try {
    register(plugin);
  } catch (e) {
    if (e instanceof PluginError) return e;
    throw e;
  }
  throw new Error('registered');
}

// The static is deliberately NOT the built-in `running` glyph: when it was, a spinner style's
// own projection could be shadowed by the glyph and every lock still passed.
const nyan = { frames: ['≋', '≈', '~'], interval: 80, static: '~nyan~' };

describe('R3 · the built-ins are a plugin like any other', () => {
  it('registered through register(), visible in the registry', () => {
    expect(registered().plugins).toContain('flagstaff');
    expect([...registered().spinners.keys()]).toEqual(['dots', 'line']);
    expect(glyph('ok')).toBe('✔');
    expect(CONTRACT).toBe(1);
  });

  it('R4 · builtins.ts is data with a type-only import, and plugin.ts registers it through the public door', () => {
    // A Windows checkout may carry CRLF; the lock reads the source, not the line endings.
    const source = (file: string): string => readFileSync(resolve(src, file), 'utf8').replaceAll('\r\n', '\n');
    expect(source('builtins.ts').match(/^import .*$/gm)).toEqual(["import { type Plugin } from './plugin.js';"]);
    expect(source('plugin.ts')).toContain('\nregister(builtins);\n');
  });
});

describe('R2 · a contribution without a static projection is refused', () => {
  it('a spinner without static: E_NO_STATIC_PROJECTION, with the fix', () => {
    const e = refusal({ name: 'x', spinners: { nyan: { frames: ['a'], interval: 80 } } });
    expect(e.code).toBe('E_NO_STATIC_PROJECTION');
    expect(e.message).toBe('nyan has no static projection');
    expect(e.fix).toMatch(/^give it a `static`/);
  });

  it('a component whose static is not a function: the same refusal', () => {
    const e = refusal({ name: 'x', components: { box: { static: 'text' } } });
    expect(e.code).toBe('E_NO_STATIC_PROJECTION');
    expect(refusal({ name: 'x', components: { box: { frame: () => '' } } }).code).toBe('E_NO_STATIC_PROJECTION');
  });
});

describe('R3 · validated against schema.json', () => {
  it.each([
    [{ name: '' }, 'plugin.name: must not be empty'],
    [{ spinners: {} }, 'plugin.name: required'],
    [{ name: 'x', spinners: { nyan: { ...nyan, frames: 'abc' } } }, 'plugin.spinners.nyan.frames: expected array, got string'],
    [{ name: 'x', spinners: { nyan: { ...nyan, frames: [] } } }, 'plugin.spinners.nyan.frames: needs at least 1 item(s)'],
    [{ name: 'x', spinners: { nyan: { ...nyan, interval: 0 } } }, 'plugin.spinners.nyan.interval: must be at least 1'],
    [{ name: 'x', spinners: { nyan: { ...nyan, interval: 1.5 } } }, 'plugin.spinners.nyan.interval: expected integer, got number'],
    [{ name: 'x', tokens: { error: 'red' } }, 'plugin.tokens.error: "red" does not match ^#[0-9a-fA-F]{6}$'],
    [{ name: 'x', glyphs: { ok: '' } }, 'plugin.glyphs.ok: must not be empty'],
    ['nope', 'plugin: expected object, got string'],
  ])('%j → %s', (plugin, message) => {
    const e = refusal(plugin);
    expect(e.code).toBe('E_PLUGIN_SCHEMA');
    expect(e.message).toBe(message);
    expect(e.fix).toBe('compare the object against flagstaff/schema.json');
  });

  it('a newer contract than this host knows is refused with the upgrade named', () => {
    const e = refusal({ name: 'x', contract: 2 });
    expect(e.code).toBe('E_PLUGIN_CONTRACT');
    expect(e.fix).toBe('upgrade flagstaff, or set contract: 1');
  });

  it('the shipped schema is the source schema (tsc re-indents it; the content is identical)', () => {
    const read = (p: string): unknown => JSON.parse(readFileSync(resolve(src, p), 'utf8'));
    expect(read('../dist/schema.json')).toEqual(read('schema.json'));
  });
});

describe('the registry', () => {
  it('an unknown spinner is refused with the names that exist', () => {
    let e: unknown;
    try {
      lookupSpinner('nope');
    } catch (err) {
      e = err;
    }
    expect(e).toBeInstanceOf(PluginError);
    expect((e as PluginError).code).toBe('E_UNKNOWN_SPINNER');
    expect((e as PluginError).fix).toBe('use one of dots, line, or register a plugin that defines it');
  });

  it('a registered plugin contributes spinners, glyphs and tokens; keys the package does not know are kept off it', () => {
    register({ name: 'acme', contract: 1, spinners: { nyan }, glyphs: { ok: 'OK' }, tokens: { error: '#b00020' }, widgets: { later: true } });
    expect(lookupSpinner('nyan')).toEqual(nyan);
    expect(glyph('ok')).toBe('OK');
    expect(registered().tokens.get('error')).toBe('#b00020');
    expect(registered().plugins).toEqual(['flagstaff', 'acme']);
  });

  it('a later plugin replaces an earlier entry of the same name — a user overrides a built-in by registering', () => {
    register({ name: 'mine', spinners: { dots: { frames: ['.'], interval: 50, static: '.' } } });
    expect(lookupSpinner('dots').frames).toEqual(['.']);
  });

  it('a hostile key cannot reach the prototype: the registry is Maps', () => {
    register(JSON.parse('{"name":"evil","glyphs":{"__proto__":"x","constructor":"y"}}'));
    expect(glyph('__proto__')).toBe('x');
    expect(({} as Record<string, unknown>)['x']).toBeUndefined();
    expect(Object.prototype.toString.call({})).toBe('[object Object]');
  });
});

/**
 * #58 — `register()` is the door, and `registered()` must not be a second one beside it.
 * U3's claim is structural: a contribution without a static projection is *refused*, not
 * discouraged. Every case here is a way a caller could have put one in anyway.
 */
/**
 * `registry.plugins` was the one field that accumulated. Every other contribution lands in a
 * `Map`, so registering the same plugin twice replaces its entries; the name list was a
 * `push`, so it grew. `flagstaff check` and the docs gallery are projections of this list,
 * and both would have shown the same plugin twice.
 */
describe('registering the same plugin twice', () => {
  const twice = { name: 'dup-probe', glyphs: { dupProbeGlyph: '*' } };

  it('lists the name once, the way every other field already behaves', () => {
    register(twice);
    const after = registered().plugins.filter((n) => n === 'dup-probe').length;
    register(twice);
    expect(registered().plugins.filter((n) => n === 'dup-probe')).toHaveLength(after);
    expect(after).toBe(1);
  });
});

describe('U3, U4 · register() is the only way into the registry', () => {
  it('a spinner set through registered() never reaches lookupSpinner', () => {
    const snapshot = registered();
    snapshot.spinners.set('sneaky', { frames: ['a', 'b'], interval: 10 } as SpinnerDef);
    expect(snapshot.spinners.has('sneaky')).toBe(true);
    let e: unknown;
    try {
      lookupSpinner('sneaky');
    } catch (err) {
      e = err;
    }
    expect((e as PluginError).code).toBe('E_UNKNOWN_SPINNER');
    expect(registered().spinners.has('sneaky')).toBe(false);
  });

  it('clearing what registered() hands back does not empty the registry', () => {
    registered().spinners.clear();
    registered().borders.clear();
    registered().glyphs.clear();
    expect(registered().spinners.has('dots')).toBe(true);
    expect(glyph('ok')).not.toBe('');
    expect(lookupSpinner('line').static).toBe('…');
  });

  it('a component with no static at all cannot be added through it', () => {
    registered().components.set('rogue', { name: 'rogue' } as Component);
    expect(registered().components.has('rogue')).toBe(false);
  });

  it('pushing onto the plugin list does not register a plugin', () => {
    registered().plugins.push('ghost');
    expect(registered().plugins).not.toContain('ghost');
  });

  it('a registered contribution is frozen: its static cannot be taken off it afterwards', () => {
    const def = registered().spinners.get('line') as SpinnerDef;
    expect(() => {
      (def as { static: string }).static = 'gone';
    }).toThrow(TypeError);
    expect(() => def.frames.push('x')).toThrow(TypeError);
    expect(lookupSpinner('line').static).toBe('…');
  });

  it('mutating the object you registered does not change what was registered', () => {
    const mine = { frames: ['a'], interval: 40, static: 'a' };
    register({ name: 'later', spinners: { later: mine } });
    mine.static = 'changed';
    mine.frames.push('b');
    expect(lookupSpinner('later').static).toBe('a');
    expect(lookupSpinner('later').frames).toEqual(['a']);
  });
});

describe('R7 · no layout engine', () => {
  it('src/ has no layout module', () => {
    expect(readdirSync(src).filter((f) => /^layout/i.test(f))).toEqual([]);
  });
});
