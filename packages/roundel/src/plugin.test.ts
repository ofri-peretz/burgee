/**
 * roundel's half of the plugin contract.
 *
 * Two cases carry the intent's whole claim, and both are asserted against a *flagstaff*
 * plugin object rather than a roundel-shaped one:
 *
 *   - the same object registers here and contributes its theme (R1);
 *   - the keys roundel does not understand are ignored, not refused (R1) — which is what
 *     makes "works on any subset of the family that is installed" true rather than hoped.
 *
 * The third is the one that would be a bug report: a plugin cannot smuggle an unreadable
 * colour in. That is asserted through `fly()`, because the contrast gate lives there and
 * re-implementing it here would be the drift the contract exists to prevent.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { contributions, PluginError, register, registered, reset, theme } from './plugin.js';
import { type Runtime } from './policy.js';
import { fly } from './theme.js';

/** A plugin as flagstaff's schema describes one: three of its four keys are not roundel's. */
const acme = {
  name: 'acme',
  contract: 1,
  tokens: { error: '#b00020', hint: '#5a5a5a' },
  glyphs: { ok: '✔' },
  spinners: { acme: { frames: ['◐', '◓'], interval: 80, static: '…' } },
  components: { bar: { static: () => 'bar' } },
};

const tty: Runtime = { env: { FORCE_COLOR: '3' }, isTTY: { stdout: true } };

beforeEach(reset);

describe('one object, four readers', () => {
  it('keeps the key it understands', () => {
    register(acme);
    expect(theme()).toEqual({ error: '#b00020', hint: '#5a5a5a' });
  });

  it('ignores the keys it does not, rather than refusing them', () => {
    expect(() => register(acme)).not.toThrow();
    expect(registered()).toHaveLength(1);
  });

  it('a plugin with no tokens at all is still a plugin', () => {
    register({ name: 'spinners-only', spinners: {} });
    expect(theme()).toEqual({});
    expect(registered()).toHaveLength(1);
  });

  it('accepts a ground, so a plugin can theme for a light terminal', () => {
    register({ name: 'paper', tokens: { ground: '#ffffff', error: '#8a0018' } });
    expect(theme().ground).toBe('#ffffff');
  });
});

describe('a plugin cannot smuggle an unreadable colour past the contrast gate', () => {
  it('fly() refuses a plugin token below 4.5:1, the same way it refuses a hand-written one', () => {
    register({ name: 'washed', tokens: { error: '#222222' } });
    expect(() => fly(theme(), tty)).toThrow(/below 4.5:1 — error #222222/);
  });

  it('and accepts one that reads', () => {
    register({ name: 'legible', tokens: { error: '#ff6b6b' } });
    expect(() => fly(theme(), tty)).not.toThrow();
  });
});

describe('refusals', () => {
  it('a misspelt token is refused, not silently dropped', () => {
    expect(() => register({ name: 'typo', tokens: { errror: '#b00020' } })).toThrow(PluginError);
    try {
      register({ name: 'typo', tokens: { errror: '#b00020' } });
    } catch (error) {
      expect((error as PluginError).code).toBe('E_PLUGIN_SCHEMA');
      expect((error as PluginError).message).toContain('"errror" is not a token');
      expect((error as PluginError).fix).toContain('heading');
    }
  });

  it('a colour that is not #rrggbb is refused, naming what was given', () => {
    expect(() => register({ name: 'named', tokens: { error: 'red' } })).toThrow(/token "error" is "red"/);
    expect(() => register({ name: 'short', tokens: { error: '#f00' } })).toThrow(/token "error"/);
  });

  it('a newer contract is refused with the upgrade named', () => {
    try {
      register({ name: 'future', contract: 2 });
      expect.unreachable('a contract from the future must not register');
    } catch (error) {
      expect((error as PluginError).code).toBe('E_PLUGIN_CONTRACT');
      expect((error as PluginError).fix).toContain('upgrade roundel');
    }
  });

  it('a plugin with no name is refused — a shadowed token has to be attributable', () => {
    expect(() => register({ tokens: { error: '#b00020' } })).toThrow(/needs a name/);
  });

  it('a refused plugin does not half-register', () => {
    expect(() => register({ name: 'bad', tokens: { error: '#b00020', nope: '#000000' } })).toThrow();
    expect(registered()).toHaveLength(0);
    expect(theme()).toEqual({});
  });
});

describe('order', () => {
  it('later wins, like flat config', () => {
    register({ name: 'base', tokens: { error: '#b00020', ok: '#0d9460' } });
    register({ name: 'override', tokens: { error: '#ff6b6b' } });
    expect(theme()).toEqual({ error: '#ff6b6b', ok: '#0d9460' });
  });

  it('reports who won a token and who it shadowed, so the override is visible', () => {
    register({ name: 'base', tokens: { error: '#b00020' } });
    register({ name: 'middle', tokens: { error: '#c81e3c' } });
    register({ name: 'top', tokens: { error: '#ff6b6b' } });
    expect(contributions()).toEqual([{ token: 'error', value: '#ff6b6b', from: 'top', shadowed: ['base', 'middle'] }]);
  });

  it('a token only one plugin sets shadows nobody', () => {
    register({ name: 'only', tokens: { hint: '#5a5a5a' } });
    expect(contributions()).toEqual([{ token: 'hint', value: '#5a5a5a', from: 'only', shadowed: [] }]);
  });
});

describe('registering does not fly', () => {
  it('a plugin cannot decide when colour is decided', () => {
    register({ name: 'acme', tokens: { error: '#ff6b6b' } });
    // Nothing has called fly(), so nothing is painted yet — the program owns that moment.
    expect(theme()).toEqual({ error: '#ff6b6b' });
  });
});
