/** R12 — a violation is reported with its provenance, so the message says which file set the bad value. */
import { describe, expect, it } from 'vitest';

import { resolve, type Layers } from './precedence.js';
import { check, validate, type Shape } from './validate.js';

const shape: Record<string, Shape> = {
  out: { type: 'string', default: 'dist' },
  retries: { type: 'number' },
  force: { type: 'boolean' },
  mode: { type: 'string', choices: ['fast', 'safe'] },
  name: { type: 'string', required: true },
};
const base: Layers = { flags: {}, env: {}, envPrefix: 'APP' };

describe('a violation names the value, the rule and where the value came from (R12)', () => {
  it('is the sentence the design asks for, line and all', () => {
    const layers: Layers = { ...base, config: { path: './mytool.config.js', data: { out: 4 }, lines: { out: 3 } } };
    const [violation] = validate(shape, resolve(shape, layers));
    expect(violation?.message).toBe('`out` must be a string; `./mytool.config.js:3` set it to `4`');
    expect(violation?.key).toBe('out');
    expect(violation?.provenance).toEqual({ source: 'config', location: './mytool.config.js', line: 3 });
  });

  it('drops the line when the source has none, rather than inventing a zero', () => {
    const layers: Layers = { ...base, env: { APP_RETRIES: 'lots' }, flags: { name: 'x' } };
    expect(validate({ retries: shape['retries'] as Shape, name: shape['name'] as Shape }, resolve({ retries: shape['retries'] as Shape, name: shape['name'] as Shape }, layers))[0]?.message).toBe('`retries` must be a number; `APP_RETRIES` set it to `"lots"`');
  });

  it('names a flag as the flag the user typed, because that is where they would look', () => {
    const layers: Layers = { ...base, flags: { force: 'yes-please' } };
    expect(validate({ force: shape['force'] as Shape }, resolve({ force: shape['force'] as Shape }, layers))[0]?.message).toBe('`force` must be a boolean; `--force` set it to `"yes-please"`');
  });

  it('reports a value outside the declared choices, listing them', () => {
    const layers: Layers = { ...base, flags: { mode: 'quick' } };
    expect(validate({ mode: shape['mode'] as Shape }, resolve({ mode: shape['mode'] as Shape }, layers))[0]?.message).toBe('`mode` must be one of fast, safe; `--mode` set it to `"quick"`');
  });

  it('reports a required option that no source set, and has no provenance to name', () => {
    const [violation] = validate({ name: shape['name'] as Shape }, resolve({ name: shape['name'] as Shape }, base));
    expect(violation?.message).toBe('`name` is required, and no source set it');
    expect(violation?.provenance).toBeUndefined();
  });

  it('says nothing at all when every value is fine — an empty array, never a thrown error', () => {
    const layers: Layers = { ...base, flags: { out: 'lib', retries: 2, force: true, mode: 'safe', name: 'app' } };
    expect(validate(shape, resolve(shape, layers))).toEqual([]);
  });

  it('reports every violation, not the first — a config with three mistakes is fixed in one pass', () => {
    const layers: Layers = { ...base, config: { path: './c.json', data: { out: 1, retries: 'x', mode: 'nope' }, lines: { out: 2, retries: 3, mode: 4 } }, flags: { name: 'a' } };
    expect(validate(shape, resolve(shape, layers)).map((v) => v.key)).toEqual(['out', 'retries', 'mode']);
  });
});

describe('an option with no declared type is not validated (R12, structural)', () => {
  it('passes anything through, because a shape that says nothing asserts nothing', () => {
    expect(validate({ anything: {} }, resolve({ anything: {} }, { ...base, flags: { anything: Symbol('x') } }))).toEqual([]);
  });
});

describe('`check` is the throwing form, for a caller that wants one error (R12)', () => {
  it('throws a CONFIG-class error whose message lists every violation', () => {
    const layers: Layers = { ...base, config: { path: './c.json', data: { out: 1 }, lines: { out: 9 } }, flags: { name: 'a' } };
    expect(() => check(shape, resolve(shape, layers))).toThrow('`out` must be a string; `./c.json:9` set it to `1`');
  });

  it('returns the values when there is nothing to say', () => {
    const resolution = resolve({ out: shape['out'] as Shape }, base);
    expect(check({ out: shape['out'] as Shape }, resolution)).toEqual({ out: 'dist' });
  });
});
