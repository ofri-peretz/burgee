/**
 * The `sources` host (`plugin-contract` R1, R5a, R6, R7, R8; seniority R13, R14).
 *
 * The one that matters is the first `describe`: a plugin adds a source, it wins a value, and
 * `--explain` names it. Everything after that exists so the host cannot be extended into
 * something that reorders the built-in precedence, which is the one thing seniority promises
 * a program cannot do.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { explain } from './explain-entry.js';
import { register, registered, reset, sources, CONTRACT, PluginError, type Plugin, type SourceRuntime } from './plugin.js';
import { ORDER, RANK, resolve, type Layers } from './precedence.js';

const specs = { region: { type: 'string' as const, default: 'us-1' } };
const base: Layers = { flags: {}, env: {}, envPrefix: 'APP' };
const runtime: SourceRuntime = { env: { CI_REGION: 'from-ci' }, cwd: '/repo' };

/** A vault that reads the environment it is handed — the shape R5a names. */
const vault: Plugin = {
  name: 'acme-vault',
  sources: {
    vault: {
      rank: RANK.env + 1,
      read: (rt) => {
        const region = rt.env['CI_REGION'];
        return region === undefined ? undefined : { location: 'acme://vault/ci', values: { region } };
      },
    },
  },
};

const caught = (fn: () => unknown): PluginError => {
  try {
    fn();
  } catch (e) {
    if (e instanceof PluginError) return e;
  }
  throw new Error('expected a PluginError');
};

beforeEach(reset);

describe('a plugin adds a source, and --explain names it (PLAN 1.3)', () => {
  it('is the provenance of the resolved value', () => {
    register(vault);
    const r = resolve(specs, { ...base, sources: sources(runtime) });
    expect(r.values['region']).toBe('from-ci');
    expect(r.provenance['region']).toEqual({ source: 'vault', location: 'acme://vault/ci' });
  });

  it('names itself in the --explain line, without seniority knowing its name (R13)', () => {
    register(vault);
    const text = explain('region', resolve(specs, { ...base, sources: sources(runtime) }));
    expect(text).toContain('from vault acme://vault/ci');
  });

  it('appears as a losing candidate when a built-in outranks it', () => {
    register(vault);
    const text = explain('region', resolve(specs, { ...base, flags: { region: 'typed' }, sources: sources(runtime) }));
    expect(text).toContain('from flag --region');
    expect(text).toContain('vault acme://vault/ci "from-ci"');
  });

  it('contributes nothing when its read returns nothing', () => {
    register(vault);
    const r = resolve(specs, { ...base, sources: sources({ env: {}, cwd: '/repo' }) });
    expect(r.provenance['region']).toEqual({ source: 'default' });
  });
});

describe('a source may be data rather than a function (R7)', () => {
  it('contributes `values` with no read at all', () => {
    register({ name: 'p', sources: { fleet: { rank: RANK.config + 1, location: 'fleet.yaml', values: { region: 'eu-2' } } } });
    const r = resolve(specs, { ...base, sources: sources(runtime) });
    expect(r.provenance['region']).toEqual({ source: 'fleet', location: 'fleet.yaml' });
  });

  it('falls back to its own name when it names no location', () => {
    register({ name: 'p', sources: { fleet: { rank: RANK.config + 1, values: { region: 'eu-2' } } } });
    const r = resolve(specs, { ...base, sources: sources(runtime) });
    expect(r.provenance['region']).toEqual({ source: 'fleet', location: 'fleet' });
  });
});

describe('rank slots a source between the built-ins; it never reorders them', () => {
  it('a source above config beats the config file', () => {
    register({ name: 'p', sources: { fleet: { rank: RANK.config - 1, values: { region: 'fleet' } } } });
    const r = resolve(specs, { ...base, config: { path: './app.config.json', data: { region: 'cfg' } }, sources: sources(runtime) });
    expect(r.values['region']).toBe('fleet');
  });

  it('a source below config loses to it', () => {
    register({ name: 'p', sources: { fleet: { rank: RANK.config + 1, values: { region: 'fleet' } } } });
    const r = resolve(specs, { ...base, config: { path: './app.config.json', data: { region: 'cfg' } }, sources: sources(runtime) });
    expect(r.values['region']).toBe('cfg');
  });

  it('cannot outrank the flag the user typed', () => {
    const e = caught(() => { register({ name: 'p', sources: { fleet: { rank: RANK.flag, values: {} } } }); });
    expect(e.code).toBe('E_PLUGIN_SCHEMA');
    expect(e.message).toContain('fleet');
  });

  it('cannot sink below the declared default', () => {
    expect(caught(() => { register({ name: 'p', sources: { fleet: { rank: RANK.default, values: {} } } }); }).code).toBe('E_PLUGIN_SCHEMA');
  });

  it('leaves the built-in order exactly as ORDER declares it', () => {
    register({ name: 'p', sources: { fleet: { rank: RANK.env + 1, values: {} } } });
    const r = resolve(specs, {
      ...base,
      env: { APP_REGION: 'e' },
      config: { path: './c.json', data: {} },
      pkg: { path: 'package.json', data: {} },
      sources: sources(runtime),
    });
    const builtin = (r.candidates['region'] ?? []).map((c) => c.source).filter((s) => (ORDER as readonly string[]).includes(s));
    expect(builtin).toEqual([...ORDER]);
  });
});

describe('the family vocabulary (R6, R8)', () => {
  it('refuses a plugin that is not an object', () => {
    expect(caught(() => { register('nope'); }).code).toBe('E_PLUGIN_SCHEMA');
  });

  it('refuses a plugin with no name', () => {
    expect(caught(() => { register({ sources: {} }); }).code).toBe('E_PLUGIN_SCHEMA');
  });

  it('refuses a newer contract than this host knows', () => {
    const e = caught(() => { register({ name: 'p', contract: CONTRACT + 1 }); });
    expect(e.code).toBe('E_PLUGIN_CONTRACT');
    expect(e.fix).toContain('upgrade');
  });

  it('refuses a source that is neither data nor a reader', () => {
    expect(caught(() => { register({ name: 'p', sources: { fleet: { rank: 5 } } }); }).code).toBe('E_PLUGIN_SCHEMA');
  });

  it('refuses a source that is both, because one source gives one answer', () => {
    expect(caught(() => { register({ name: 'p', sources: { fleet: { rank: 5, values: {}, read: () => undefined } } }); }).code).toBe('E_PLUGIN_SCHEMA');
  });

  it.each([
    ['`sources` is not an object', { sources: [] }, 'plugin "p": sources must be an object'],
    ['a source is not an object', { sources: { fleet: 5 } }, 'plugin "p": source "fleet" is not an object'],
    ['`values` is not an object', { sources: { fleet: { rank: 5, values: 'region=eu' } } }, 'plugin "p": source "fleet": values must be an object'],
    ['`read` is not a function', { sources: { fleet: { rank: 5, read: 'vault://x' } } }, 'plugin "p": source "fleet": read must be a function'],
    ['`location` is not a string', { sources: { fleet: { rank: 5, values: {}, location: 7 } } }, 'plugin "p": source "fleet": location must be a string'],
  ])('refuses a plugin whose %s, naming where', (_what, rest, message) => {
    const e = caught(() => {
      register({ name: 'p', ...rest });
    });
    expect(e.code).toBe('E_PLUGIN_SCHEMA');
    expect(e.message).toBe(message);
  });

  it('lists what it registered, in registration order', () => {
    const first: Plugin = { name: 'first' };
    const second: Plugin = { name: 'second', sources: { fleet: { rank: 5, values: {} } } };
    register(first);
    register(second);
    expect(registered()).toEqual([first, second]);
    reset();
    expect(registered()).toEqual([]);
  });

  it('hands `resolve` its layers by rank, and the later plugin first within a rank', () => {
    register({ name: 'first', sources: { low: { rank: RANK.config + 1, values: {} }, tieA: { rank: RANK.env + 2, values: {} } } });
    register({ name: 'second', sources: { high: { rank: RANK.env + 1, values: {} }, tieB: { rank: RANK.env + 2, values: {} } } });
    expect(sources(runtime).map((layer) => layer.source)).toEqual(['high', 'tieB', 'tieA', 'low']);
  });

  it('keeps one plugin\'s own sources in the order it declared them, within a rank', () => {
    register({ name: 'one', sources: { a: { rank: RANK.env + 2, values: {} }, b: { rank: RANK.env + 2, values: {} } } });
    expect(sources(runtime).map((layer) => layer.source)).toEqual(['a', 'b']);
  });

  /*
   * The spec, `register`'s own comment and the plugins guide all say the later plugin wins at
   * an equal rank, like ESLint flat config. Until 2026-09-30 the earlier one did: `sources()`
   * read the plugins oldest first, the sort is stable, and `resolve` takes the first candidate
   * with a value. The case above only asserted the order, so nothing said which way it cut.
   */
  it('resolves a tie at an equal rank to the plugin registered later', () => {
    register({ name: 'fleet-default', sources: { fleet: { rank: RANK.env + 5, values: { region: 'us-1' } } } });
    register({ name: 'fleet-override', sources: { vault: { rank: RANK.env + 5, values: { region: 'eu-1' } } } });
    const resolution = resolve({ region: {} }, { flags: {}, env: {}, sources: sources(runtime) });
    expect(resolution.values['region']).toBe('eu-1');
    expect(resolution.provenance['region']).toEqual({ source: 'vault', location: 'vault' });
  });

  it('ignores a key it does not host, so one object serves the whole family (R1)', () => {
    expect(() => { register({ name: 'p', tokens: { ok: '#00ff00' }, spinners: {} }); }).not.toThrow();
    expect(sources(runtime)).toEqual([]);
  });
});
